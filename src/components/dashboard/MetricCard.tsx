import React from "react";
import ComponentCard from "@/components/common/ComponentCard";

type MetricCardProps = {
  title: string;
  value: string | number;
  loading?: boolean;
  error?: string | null;
  description?: string;
  icon?: React.ReactNode;
};

export default function MetricCard({
  title,
  value,
  loading,
  error,
  description,
  icon,
}: MetricCardProps) {
  return (
    <ComponentCard>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {title}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            {loading ? (
              <div className="h-8 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            ) : error ? (
              <p className="text-sm text-error-500">{error}</p>
            ) : (
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white">
                {value}
              </h3>
            )}
          </div>
          {description && !loading && !error && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {description}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/10">
            {icon}
          </div>
        )}
      </div>
    </ComponentCard>
  );
}
