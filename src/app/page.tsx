import { redirect } from "next/navigation";

/** `/` redirects to the default locale. All content lives under /en and /ar. */
export default function RootPage() {
  redirect("/en");
}
