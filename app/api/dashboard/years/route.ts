import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const years = db.prepare(`
      SELECT DISTINCT strftime('%Y', created_at) as year
      FROM orders
      WHERE created_at IS NOT NULL
      ORDER BY year DESC
    `).all() as { year: string }[];

    return NextResponse.json(years.map(row => row.year));
  } catch (error) {
    console.error('Years API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
