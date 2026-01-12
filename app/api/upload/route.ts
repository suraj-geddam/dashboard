import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import Papa from 'papaparse';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Validate file size (50MB limit)
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: 'File too large. Maximum file size is 50MB.'
      }, { status: 400 });
    }

    const text = await file.text();
    const { data, errors } = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
    });

    if (errors.length > 0) {
      console.error('CSV Parsing errors:', errors);
      return NextResponse.json({ error: 'Failed to parse CSV' }, { status: 400 });
    }

    // Group by created_at to form orders
    const ordersMap = new Map();

    data.forEach((row: any) => {
      const createdAt = row['CREATED_AT'];
      if (!createdAt) return;

      if (!ordersMap.has(createdAt)) {
        ordersMap.set(createdAt, {
          id: uuidv4(),
          created_at: createdAt,
          store_name: row['STORE_NAME'],
          delivery_time: row['DELIVERY_TIME'],
          delivery_address: row['DELIVERY_ADDRESS'],
          items: [],
          total_amount: 0
        });
      }

      const order = ordersMap.get(createdAt);
      const quantity = parseInt(row['QUANTITY'] || '1', 10);
      const unitPrice = parseFloat(row['UNIT_PRICE'] || '0');
      const subtotal = parseFloat(row['SUBTOTAL'] || '0');

      order.items.push({
        item_name: row['ITEM'],
        category: row['CATEGORY'],
        unit_price: unitPrice,
        quantity: quantity,
        subtotal: subtotal
      });

      order.total_amount += subtotal;
    });

    // Transaction to insert data
    const insertOrder = db.prepare(`
            INSERT INTO orders (id, created_at, store_name, delivery_time, delivery_address, total_amount)
            VALUES (@id, @created_at, @store_name, @delivery_time, @delivery_address, @total_amount)
        `);

    const insertOrderItem = db.prepare(`
            INSERT INTO order_items (order_id, item_name, category, unit_price, quantity, subtotal)
            VALUES (@order_id, @item_name, @category, @unit_price, @quantity, @subtotal)
        `);

    const deleteOrders = db.prepare('DELETE FROM orders');
    const deleteOrderItems = db.prepare('DELETE FROM order_items');

    const insertTransaction = db.transaction((orders: any[]) => {
      deleteOrderItems.run();  // Delete child records first
      deleteOrders.run();       // Then delete parent records

      for (const order of orders) {
        insertOrder.run({
          id: order.id,
          created_at: order.created_at,
          store_name: order.store_name,
          delivery_time: order.delivery_time,
          delivery_address: order.delivery_address,
          total_amount: order.total_amount
        });

        for (const item of order.items) {
          insertOrderItem.run({
            order_id: order.id,
            item_name: item.item_name,
            category: item.category,
            unit_price: item.unit_price,
            quantity: item.quantity,
            subtotal: item.subtotal
          });
        }
      }
    });

    insertTransaction(Array.from(ordersMap.values()));

    return NextResponse.json({ success: true, count: ordersMap.size });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
