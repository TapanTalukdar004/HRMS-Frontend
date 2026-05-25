import Link from "next/link";

export type SkillInfo = {
  icon: string;
  title: string;
  subtitle: string;
  triggerPhrases: string[];
  questions: string[];
  output: string;
  output_path_example: string;
};

export function SkillInfoPage({ skill }: { skill: SkillInfo }) {
  return (
    <main className="max-w-4xl mx-auto px-8 py-10">
      <Link href="/" className="text-sm text-slate-500 hover:text-[#AE00D0]">
        ← Home
      </Link>

      <header className="mt-4 mb-10 flex items-start gap-5">
        <div className="text-5xl leading-none">{skill.icon}</div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{skill.title}</h1>
          <p className="mt-2 text-slate-600 leading-relaxed">{skill.subtitle}</p>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          How to use
        </h2>
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <ol className="space-y-4 text-sm text-slate-700">
            <li>
              <span className="font-semibold text-slate-900">1. Open a DM with HR Bot Demo in Slack.</span>
              <p className="text-slate-500 mt-1">
                Anyone in the workspace can talk to the bot.
              </p>
            </li>
            <li>
              <span className="font-semibold text-slate-900">2. Type one of these phrases:</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {skill.triggerPhrases.map((p) => (
                  <code key={p} className="text-xs bg-stone-100 text-slate-700 px-2 py-1 rounded">
                    {p}
                  </code>
                ))}
              </div>
            </li>
            <li>
              <span className="font-semibold text-slate-900">3. The bot will ask you these questions, one at a time:</span>
              <ul className="mt-2 space-y-1 list-disc pl-5 text-slate-600">
                {skill.questions.map((q) => (
                  <li key={q} className="text-sm">{q}</li>
                ))}
              </ul>
            </li>
            <li>
              <span className="font-semibold text-slate-900">4. Confirm with <code className="text-xs bg-stone-100 px-1.5 py-0.5 rounded">yes</code></span>
              <p className="text-slate-500 mt-1">
                The bot generates the document and DMs it back to you.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          What you get
        </h2>
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <p className="text-sm text-slate-700 leading-relaxed">{skill.output}</p>
          <div className="mt-3 text-xs text-slate-500 font-mono">
            example: <span className="text-slate-700">{skill.output_path_example}</span>
          </div>
        </div>
      </section>

      <section>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
          <div className="font-semibold mb-1">⚠️ Slack scope required</div>
          <p>
            The bot needs the <code className="bg-amber-100 px-1.5 py-0.5 rounded">files:write</code> OAuth
            scope to deliver the generated file in Slack. Without it, the bot still generates
            the file (saved to the server) but can&apos;t upload it. Ask Tapan or the workspace
            admin to add the scope in the Slack app config.
          </p>
        </div>
      </section>
    </main>
  );
}
