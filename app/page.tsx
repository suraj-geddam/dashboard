'use client';

import { useEffect, useState } from 'react';
import { DollarSign, ShoppingBag, TrendingUp, Loader2 } from 'lucide-react';
import KpiCard from './components/KpiCard';
import MonthlySpendChart from './components/MonthlySpendChart';
import CategoryPieChart from './components/CategoryPieChart';
import TopStoresTable from './components/TopStoresTable';

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('');

  // Fetch available years on mount
  useEffect(() => {
    fetch('/api/dashboard/years')
      .then(res => res.json())
      .then(years => {
        setAvailableYears(years);
        // Set most recent year as default
        if (years.length > 0) {
          setSelectedYear(years[0]);
        }
      })
      .catch(err => console.error('Failed to fetch years:', err));
  }, []);

  // Fetch dashboard data when year changes
  useEffect(() => {
    if (!selectedYear) return;

    setLoading(true);
    fetch(`/api/dashboard?year=${selectedYear}`)
      .then(res => res.json())
      .then(data => {
        setData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [selectedYear]);

  if (loading || !selectedYear) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#FF3008]" />
      </div>
    );
  }

  if (!data) return <div>Error loading data</div>;

  // Check if selected year has no data
  if (data.totalOrders === 0 && data.totalSpend === 0) {
    return (
      <div className="space-y-8">
        {/* Year Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-4 -mb-px">
            {availableYears.map(year => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`px-6 py-3 font-semibold border-b-2 transition-colors ${
                  selectedYear === year
                    ? 'text-[#FF3008] border-[#FF3008]'
                    : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {year}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex h-[50vh] items-center justify-center">
          <div className="text-center">
            <p className="text-gray-500 text-lg">No orders found for {selectedYear}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Year Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4 -mb-px">
          {availableYears.map(year => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`px-6 py-3 font-semibold border-b-2 transition-colors ${
                selectedYear === year
                  ? 'text-[#FF3008] border-[#FF3008]'
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {year}
            </button>
          ))}
        </nav>
      </div>

      {/* Subtitle */}
      <div>
        <p className="text-gray-500">Your spending habits in {selectedYear}.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiCard
          title="Total Spend"
          value={`$${data.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={DollarSign}
          iconBgColor="bg-red-50"
          iconColor="text-[#FF3008]"
          yoyChange={data.yoyChanges?.totalSpend}
        />

        <KpiCard
          title="Total Orders"
          value={data.totalOrders.toString()}
          icon={ShoppingBag}
          iconBgColor="bg-blue-50"
          iconColor="text-blue-600"
          yoyChange={data.yoyChanges?.totalOrders}
        />

        <KpiCard
          title="Avg. Order Value"
          value={`$${data.totalOrders > 0 ? (data.totalSpend / data.totalOrders).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}`}
          icon={TrendingUp}
          iconBgColor="bg-purple-50"
          iconColor="text-purple-600"
          yoyChange={data.yoyChanges?.avgOrderValue}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <MonthlySpendChart data={data.monthlySpend} />
        <CategoryPieChart data={data.categoryDist} />
      </div>

      {/* Top Stores Table */}
      <TopStoresTable stores={data.topStores} />
    </div>
  );
}
