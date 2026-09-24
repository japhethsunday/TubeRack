import { redirect } from "next/navigation";

/** The internal component gallery is retired from the product. */
export default function RetiredDesignPage() {
  redirect("/dashboard");
}
