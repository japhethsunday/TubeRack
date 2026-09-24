import { redirect } from "next/navigation";

/** The old static module preview is retired; every stage now opens its real studio. */
export default function RetiredPreviewPage() {
  redirect("/projects");
}
