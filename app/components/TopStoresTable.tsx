interface StoreData {
  store_name: string;
  total: number;
}

interface TopStoresTableProps {
  stores: StoreData[];
}

export default function TopStoresTable({ stores }: TopStoresTableProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <h3 className="text-lg font-bold text-gray-900">Top Stores</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-50 text-gray-900 font-medium">
            <tr>
              <th className="px-6 py-4">Store Name</th>
              <th className="px-6 py-4 text-right">Total Spend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {stores.map((store, index) => (
              <tr key={index} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-medium text-gray-900">{store.store_name}</td>
                <td className="px-6 py-4 text-right">${store.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
