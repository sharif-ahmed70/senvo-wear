import { redirect } from "next/navigation";

export default function PosPage() {
  const adminUrl =
    process.env.NEXT_PUBLIC_SENVO_ADMIN_URL?.replace(/\/$/u, "") ??
    "http://localhost:3001";
  redirect(`${adminUrl}/pos/sell`);
}
