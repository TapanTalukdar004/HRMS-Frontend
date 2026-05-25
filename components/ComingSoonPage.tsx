import { Card, CardHeader } from "./ui/Card";
import { Badge } from "./ui/Badge";

export function ComingSoonPage({
  title,
  emoji,
  description,
  whatItWillShow,
  prerequisites,
}: {
  title: string;
  emoji: string;
  description: string;
  whatItWillShow: string[];
  prerequisites: string[];
}) {
  return (
    <main className="p-8">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8 flex items-start gap-4">
          <span className="text-3xl mt-1">{emoji}</span>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                {title}
              </h1>
              <Badge tone="amber">Coming soon</Badge>
            </div>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              {description}
            </p>
          </div>
        </header>

        <Card className="mb-4">
          <CardHeader title="What this page will show" />
          <ul className="space-y-2 text-sm text-slate-700">
            {whatItWillShow.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-[#7B5AFF] mt-1.5 text-xs">●</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="bg-amber-50/40 ring-amber-200/80">
          <CardHeader title="What's needed first" />
          <ul className="space-y-2 text-sm text-slate-700">
            {prerequisites.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-amber-600 mt-1.5 text-xs">○</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </main>
  );
}
