import { jdSkills, jdResponsibilities, jdExperienceText, jdSalaryText, type JobJDRow } from "@/lib/jdData";

/** On-page RUH-AI branded job description — mirrors the sections of the downloadable PDF
 *  (skills/jd-pdf-generator) so the apply page shows the real company-format JD, not plain text.
 *  Server component; brand colors navy #12125c + purple #8b27ff. */

const NAVY = "#12125c";
const PURPLE = "#8b27ff";

function Badge({ children }: { children: string }) {
  return (
    <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.09em] text-white rounded px-2 py-0.5 mb-1.5" style={{ background: NAVY }}>
      {children}
    </span>
  );
}
function SectionH({ children }: { children: string }) {
  return <h2 className="text-[17px] font-extrabold mb-1.5" style={{ color: NAVY }}>{children}</h2>;
}

export default function BrandedJD({ row, monthYear }: { row: JobJDRow; monthYear: string }) {
  const skills = jdSkills(row);
  const responsibilities = jdResponsibilities(row);
  const expText = jdExperienceText(row);
  const salary = jdSalaryText(row);

  const summaryRows: [string, string][] = [
    ["Position", row.title],
    ["Company", "RUH AI"],
    ["Industry", "AI / SaaS / Technology"],
    ["Location", "Remote"],
    ["Employment", row.employment_type || "Full-Time"],
    ...(row.department ? [["Department", row.department] as [string, string]] : []),
    ...(row.level ? [["Position Type", row.level] as [string, string]] : []),
    ...(row.openings ? [["Openings", String(row.openings)] as [string, string]] : []),
  ];

  return (
    <article className="text-[13.5px] text-slate-700 leading-relaxed">
      {/* header */}
      <div className="text-3xl font-extrabold leading-none tracking-tight">
        <span style={{ color: NAVY }}>RUH </span><span style={{ color: PURPLE }}>AI</span>
      </div>
      <div className="italic text-[13px] mt-0.5 mb-3" style={{ color: PURPLE }}>Your Business. Supercharged by AI</div>
      <hr className="border-t-2 mb-4" style={{ borderColor: PURPLE }} />
      <div className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: NAVY }}>Job Description</div>
      <h1 className="text-2xl font-extrabold mt-1" style={{ color: PURPLE }}>{row.title}</h1>
      <div className="text-[12px] text-slate-500 mt-1">{monthYear} · Prepared by RUH AI · Confidential</div>

      {/* summary table */}
      <table className="w-full border-collapse my-5 text-[12.5px]">
        <tbody>
          {summaryRows.map(([k, v]) => (
            <tr key={k}>
              <td className="border border-[#d6d6f0] px-3 py-1.5 font-semibold w-2/5" style={{ color: PURPLE, background: "#f5f5ff" }}>{k}</td>
              <td className="border border-[#d6d6f0] px-3 py-1.5">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Badge>About the Company</Badge>
      <SectionH>About RUH AI</SectionH>
      <p className="mb-3">Founded with a vision to transform businesses through intelligent automation, RUH AI is a rapidly growing technology company specializing in AI-powered solutions, SaaS platforms, and digital transformation services. RUH AI enables organizations to streamline operations, enhance productivity, and scale efficiently by leveraging cutting-edge artificial intelligence and cloud technologies.</p>
      <p className="mb-3">The company serves a diverse range of clients, from startups to enterprise organizations, delivering scalable, high-performance solutions tailored to modern business needs, with a strong focus on reliability, innovation, and customer success.</p>
      <p className="mb-4">RUH AI operates with a global-first approach, supporting clients across multiple geographies and industries, and fosters a culture of collaboration and continuous learning.</p>

      <hr className="border-stone-200 my-4" />
      <Badge>Role Overview</Badge>
      <SectionH>{`${row.title} Role`}</SectionH>
      <p className="mb-4">{row.summary || "Details about this role are provided below."}</p>

      {responsibilities.length > 0 && (
        <>
          <hr className="border-stone-200 my-4" />
          <Badge>Key Responsibilities</Badge>
          <SectionH>What You Will Do</SectionH>
          <ul className="list-disc pl-5 space-y-1 mb-4">
            {responsibilities.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </>
      )}

      <hr className="border-stone-200 my-4" />
      <Badge>Qualifications</Badge>
      <SectionH>Required Qualifications</SectionH>
      <ul className="list-disc pl-5 space-y-1 mb-4">
        {expText && <li>Minimum {expText}.</li>}
        {skills.length > 0 && <li>Proficiency in: {skills.join(", ")}.</li>}
        {!expText && skills.length === 0 && <li>See the role overview for qualification details.</li>}
      </ul>

      <hr className="border-stone-200 my-4" />
      <Badge>Compensation &amp; Benefits</Badge>
      <SectionH>What RUH AI Offers</SectionH>
      <ul className="list-disc pl-5 space-y-1 mb-4">
        <li>Competitive base salary{salary ? <>: <strong>{salary}</strong></> : " (commensurate with experience)"}.</li>
        <li>Performance-based incentives and growth-linked appraisals.</li>
        <li>Opportunity to work with global clients and exposure to international projects.</li>
        <li>Remote-first work culture with flexible work arrangements.</li>
        <li>Comprehensive health and wellness benefits, PTO, sick leave, and company holidays.</li>
        <li>Learning &amp; development support — certifications, training programs, and upskilling.</li>
        <li>Collaborative, fast-paced environment with strong career growth and cutting-edge AI/SaaS work.</li>
      </ul>

      <hr className="border-stone-200 my-4" />
      <Badge>Application</Badge>
      <SectionH>How to Apply</SectionH>
      <p className="mb-1">Submit your resume below, along with links to any relevant projects, certifications, or profiles (GitHub, portfolio). Applications are reviewed on a rolling basis; only shortlisted candidates will be contacted for next steps.</p>
      <p className="text-[12px] text-slate-500">RUH AI is an equal-opportunity employer committed to an inclusive environment for all, regardless of race, gender, sexual orientation, religion, disability, or veteran status.</p>
    </article>
  );
}
