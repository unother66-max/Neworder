import { NewOrderWorkspace } from "../workspace";

export default async function NewOrderPriceComparePage({
  searchParams,
}: {
  searchParams: Promise<{ itemId?: string | string[] }>;
}) {
  const itemId = (await searchParams).itemId;
  return (
    <NewOrderWorkspace
      view="price-compare"
      initialItemId={typeof itemId === "string" ? itemId : ""}
    />
  );
}
