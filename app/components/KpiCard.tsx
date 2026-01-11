import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  iconBgColor: string;
  iconColor: string;
  yoyChange?: number | null;
}

export default function KpiCard({ title, value, icon: Icon, iconBgColor, iconColor, yoyChange }: KpiCardProps) {
  const renderYoYBadge = (change: number | null | undefined) => {
    if (change === null || change === undefined) return null;

    const isPositive = change >= 0;
    const formattedChange = Math.abs(change).toFixed(1);

    return (
      <span className={`text-sm font-medium px-2 py-1 rounded ${
        isPositive
          ? 'text-green-600 bg-green-50'
          : 'text-red-600 bg-red-50'
      }`}>
        {isPositive ? '+' : '-'}{formattedChange}%
      </span>
    );
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div className={`${iconBgColor} p-3 rounded-lg`}>
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
        {renderYoYBadge(yoyChange)}
      </div>
      <h3 className="text-gray-500 text-sm font-medium">{title}</h3>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
