import { type LucideIcon, Inbox, SearchX } from 'lucide-react';
import { Button } from '@components/ui/button';

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  filtered?: boolean;
  onClearFilters?: () => void;
}

export default function EmptyState({ icon: Icon = Inbox, title, description, action, filtered, onClearFilters }: Props) {
  if (filtered) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <SearchX className="h-12 w-12 text-gray-300 mb-4" />
        <h3 className="text-base font-medium text-gray-900 mb-1">No results found</h3>
        <p className="text-sm text-gray-500 mb-4">Try adjusting your search or filters.</p>
        {onClearFilters && (
          <Button variant="outline" onClick={onClearFilters}>Clear Filters</Button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="h-12 w-12 text-gray-300 mb-4" />
      <h3 className="text-base font-medium text-gray-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
      {action && (
        <Button onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  );
}
