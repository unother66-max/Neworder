import { redirect } from "next/navigation";

export default function NewOrderCheckPage() {
  redirect("/operations/neworder/price-compare");
}
