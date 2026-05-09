import React from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from 'recharts';

const fmt = (v) => {
  if (v >= 1000000) return `₹${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v}`;
};

const ParetoChart = ({ data, loading }) => {
  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <span style={{ color: 'var(--text-muted)' }}>Loading Analysis...</span>
    </div>
  );
  
  if (!data || data.length === 0) return (
    <div className="flex items-center justify-center h-full">
      <span style={{ color: 'var(--text-muted)' }}>No product data available.</span>
    </div>
  );

  // Focus on top contributors for visibility
  const chartData = data.slice(0, 15);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis 
          dataKey="title" 
          tick={{ fontSize: 9, fill: 'var(--text-secondary)' }}
          interval={0}
          angle={-30}
          textAnchor="end"
          axisLine={false}
          tickLine={false}
        />
        <YAxis 
          yAxisId="left"
          tickFormatter={fmt}
          tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis 
          yAxisId="right" 
          orientation="right" 
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
          axisLine={false}
          tickLine={false}
          domain={[0, 100]}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
          formatter={(value, name) => {
            if (name === 'Revenue') return [fmt(value), name];
            return [`${value.toFixed(1)}%`, 'Cumulative %'];
          }}
        />
        <Bar 
          yAxisId="left" 
          dataKey="revenue" 
          name="Revenue" 
          barSize={24} 
          radius={[4, 4, 0, 0]}
        >
          {chartData.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={entry.cumulative_percentage <= 80 ? 'var(--blue)' : 'rgba(255,255,255,0.05)'} 
            />
          ))}
        </Bar>
        <Line 
          yAxisId="right" 
          type="monotone" 
          dataKey="cumulative_percentage" 
          name="Cumulative %" 
          stroke="var(--green)" 
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--green)', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
        <ReferenceLine 
          yAxisId="right" 
          y={80} 
          stroke="var(--red)" 
          strokeDasharray="5 5" 
          label={{ value: '80% Threshold', position: 'insideTopRight', fill: 'var(--red)', fontSize: 10 }} 
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default ParetoChart;
