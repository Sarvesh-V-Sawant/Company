import { Construction } from 'lucide-react';

interface Props {
  phase: string;
  title: string;
  description?: string;
}

export default function ComingSoonCard({ phase, title, description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[320px] rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 mb-4">
        <Construction className="h-7 w-7 text-amber-500" />
      </div>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">{title}</h2>
      {description && (
        <p className="text-sm text-gray-500 mb-3 max-w-sm">{description}</p>
      )}
      <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
        Coming in {phase}
      </span>
    </div>
  );
}
