import { SkillInfoPage } from "@/components/SkillInfoPage";

export const metadata = { title: "Resume Screener · HR Bot" };

export default function ResumeScreenerPage() {
  return (
    <SkillInfoPage skill={{
      icon: "🤖",
      title: "Resume Screener",
      subtitle:
        "Compare candidates against a job description. The bot ranks them and DMs a comparison PDF.",
      triggerPhrases: ["screen resumes", "compare candidates", "shortlist applicants", "who should I interview"],
      questions: [
        "Paste the job description summary, or describe the role",
        "Brief notes about the candidates (names, sources)",
      ],
      output:
        "A comparison PDF + JSON breakdown with each candidate's score, strengths, gaps vs the JD. Ranked from best fit to worst. Used to pick who to interview.",
      output_path_example: "skill_outputs/compare_<role>_<timestamp>.pdf",
    }} />
  );
}
