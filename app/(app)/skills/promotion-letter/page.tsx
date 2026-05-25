import { SkillInfoPage } from "@/components/SkillInfoPage";

export const metadata = { title: "Promotion Letter · HR Bot" };

export default function PromotionLetterPage() {
  return (
    <SkillInfoPage skill={{
      icon: "🎉",
      title: "Promotion Letter",
      subtitle:
        "Generate a promotion / increment letter on RUH AI letterhead, ready to share with the employee.",
      triggerPhrases: ["promotion letter", "promo letter", "create promotion", "make promo letter"],
      questions: [
        "Employee full name",
        "Employee ID",
        "New designation",
        "Effective date",
        "New CTC (e.g. 24 LPA)",
        "Manager name",
      ],
      output:
        "A PDF letter on RUH AI letterhead with the new role, effective date, and revised CTC. Signed-off layout, ready to send to the employee.",
      output_path_example: "skill_outputs/promotion_letter_<Name>_<timestamp>.pdf",
    }} />
  );
}
