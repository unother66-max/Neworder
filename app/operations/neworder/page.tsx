import { redirect } from "next/navigation";

export default function NewOrderDashboardPage() {
  redirect("/operations/neworder/price-compare");
}
