import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');

    // Validate year parameter
    if (year && (!/^\d{4}$/.test(year) || parseInt(year) < 2000 || parseInt(year) > 2100)) {
      return NextResponse.json({ error: 'Invalid year parameter' }, { status: 400 });
    }

    // Build year filter
    const yearFilter = year ? `WHERE strftime('%Y', created_at) = '${year}'` : '';

    // Total Spend
    const totalSpend = db.prepare(`
      SELECT SUM(total_amount) as total
      FROM orders
      ${yearFilter}
    `).get() as { total: number };

    // Total Orders
    const totalOrders = db.prepare(`
      SELECT COUNT(*) as count
      FROM orders
      ${yearFilter}
    `).get() as { count: number };

    // Top Stores (by spend)
    const topStores = db.prepare(`
      SELECT store_name, SUM(total_amount) as total
      FROM orders
      ${yearFilter}
      GROUP BY store_name
      ORDER BY total DESC
      LIMIT 5
    `).all();

    // Monthly Spend
    const monthlySpend = db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, SUM(total_amount) as total
      FROM orders
      ${yearFilter}
      GROUP BY month
      ORDER BY month ASC
    `).all();

    // Category Distribution (from order_items)
    const categoryDist = db.prepare(`
      SELECT oi.category, SUM(oi.subtotal) as total
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      ${yearFilter}
      GROUP BY oi.category
      ORDER BY total DESC
      LIMIT 5
    `).all();

    // Calculate year-over-year changes (if year is specified)
    let yoyChanges = null;
    if (year) {
      const previousYear = (parseInt(year) - 1).toString();
      const previousYearFilter = `WHERE strftime('%Y', created_at) = '${previousYear}'`;

      // Previous year total spend
      const prevTotalSpend = db.prepare(`
        SELECT SUM(total_amount) as total
        FROM orders
        ${previousYearFilter}
      `).get() as { total: number };

      // Previous year total orders
      const prevTotalOrders = db.prepare(`
        SELECT COUNT(*) as count
        FROM orders
        ${previousYearFilter}
      `).get() as { count: number };

      const currentSpend = totalSpend.total || 0;
      const prevSpend = prevTotalSpend.total || 0;
      const currentOrders = totalOrders.count || 0;
      const prevOrders = prevTotalOrders.count || 0;
      const currentAvgOrderValue = currentOrders > 0 ? currentSpend / currentOrders : 0;
      const prevAvgOrderValue = prevOrders > 0 ? prevSpend / prevOrders : 0;

      // Calculate percentage changes
      yoyChanges = {
        totalSpend: prevSpend > 0 ? ((currentSpend - prevSpend) / prevSpend) * 100 : null,
        totalOrders: prevOrders > 0 ? ((currentOrders - prevOrders) / prevOrders) * 100 : null,
        avgOrderValue: prevAvgOrderValue > 0 ? ((currentAvgOrderValue - prevAvgOrderValue) / prevAvgOrderValue) * 100 : null,
      };
    }

    return NextResponse.json({
      totalSpend: totalSpend.total || 0,
      totalOrders: totalOrders.count || 0,
      topStores,
      monthlySpend,
      categoryDist,
      yoyChanges,
    });
  } catch (error) {
    console.error('Dashboard API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
