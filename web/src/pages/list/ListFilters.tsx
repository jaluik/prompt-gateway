import { Filter, ListFilter } from "lucide-react";

import { Button } from "../../components/ui";
import type { SortMode, TimeFilter } from "../../types";

type Props = {
  timeFilter: TimeFilter;
  modelFilter: string;
  toolFilter: string;
  contextFilter: string;
  sortMode: SortMode;
  modelOptions: string[];
  onTimeFilterChange: (value: TimeFilter) => void;
  onModelFilterChange: (value: string) => void;
  onToolFilterChange: (value: string) => void;
  onContextFilterChange: (value: string) => void;
  onSortModeChange: (value: SortMode) => void;
  onReset: () => void;
};

export function ListFilters({
  timeFilter,
  modelFilter,
  toolFilter,
  contextFilter,
  sortMode,
  modelOptions,
  onTimeFilterChange,
  onModelFilterChange,
  onToolFilterChange,
  onContextFilterChange,
  onSortModeChange,
  onReset,
}: Props) {
  return (
    <aside className="filter-panel panel">
      <div className="panel-head">
        <div className="panel-title">
          <Filter aria-hidden="true" />
          筛选
        </div>
      </div>
      <div className="panel-body filter-stack">
        <label className="field-label">
          时间范围
          <select
            value={timeFilter}
            onChange={(event) => onTimeFilterChange(event.target.value as TimeFilter)}
          >
            <option value="all">全部时间</option>
            <option value="24h">最近 24 小时</option>
            <option value="7d">最近 7 天</option>
          </select>
        </label>
        <label className="field-label">
          模型
          <select value={modelFilter} onChange={(event) => onModelFilterChange(event.target.value)}>
            <option value="all">全部模型</option>
            {modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          工具
          <select value={toolFilter} onChange={(event) => onToolFilterChange(event.target.value)}>
            <option value="all">全部</option>
            <option value="with-tools">有工具定义</option>
            <option value="with-tool-calls">有工具调用</option>
          </select>
        </label>
        <label className="field-label">
          Context Management
          <select
            value={contextFilter}
            onChange={(event) => onContextFilterChange(event.target.value)}
          >
            <option value="all">全部</option>
            <option value="with-context">包含 context edit</option>
          </select>
        </label>
        <label className="field-label">
          排序
          <select
            value={sortMode}
            onChange={(event) => onSortModeChange(event.target.value as SortMode)}
          >
            <option value="latest">最近更新时间</option>
            <option value="context">上下文规模</option>
            <option value="requests">请求数量</option>
          </select>
        </label>
        <Button icon={ListFilter} onClick={onReset}>
          清空筛选
        </Button>
      </div>
    </aside>
  );
}
