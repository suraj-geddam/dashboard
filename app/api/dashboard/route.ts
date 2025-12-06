import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    // Total Spend
    const totalSpend = db.prepare('SELECT SUM(total_amount) as total FROM orders').get() as { total: number };

    // Total Orders
    const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get() as { count: number };

    // Top Stores (by spend)
    const topStores = db.prepare(`
            SELECT store_name, SUM(total_amount) as total 
            FROM orders 
            GROUP BY store_name 
            ORDER BY total DESC 
            LIMIT 5
        `).all();

    // Monthly Spend
    const monthlySpend = db.prepare(`
            SELECT strftime('%Y-%m', created_at) as month, SUM(total_amount) as total
            FROM orders
            GROUP BY month
            ORDER BY month ASC
        `).all();

    // Category Distribution (from order_items)
    const categoryDist = db.prepare(`
            SELECT category, SUM(subtotal) as total
            FROM order_items
            GROUP BY category
            ORDER BY total DESC
            LIMIT 5
        `).all();

    return NextResponse.json({
      totalSpend: totalSpend.total || 0,
      totalOrders: totalOrders.count || 0,
      topStores,
      monthlySpend,
      categoryDist
    });
  } catch (error) {
    console.error('Dashboard API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
