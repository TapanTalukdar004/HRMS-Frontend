import { SkillInfoPage } from "@/components/SkillInfoPage";

export const metadata = { title: "Experience Letter · HR Bot" };

export default function ExperienceLetterPage() {
  return (
    <SkillInfoPage skill={{
      icon: "📜",
      title: "Experience Letter",
      subtitle:
        "Generate a formal experience / relieving letter on RUH AI letterhead. Used when an employee leaves or needs proof of employment.",
      triggerPhrases: ["experience letter", "relieving letter", "service letter", "employment certificate"],
      questions: [
        "Employee full name",
        "Employee ID (e.g. RUH012)",
        "Joining date",
        "Last working date",
        "Designation at exit",
        "Department",
      ],
      output:
        "A formal DOCX or PDF letter on RUH AI letterhead with the employee's tenure, designation, and a standard reference paragraph. DM'd back to you.",
      output_path_example: "skill_outputs/experience_letter_<Name>_<timestamp>.docx",
    }} />
  );
}
