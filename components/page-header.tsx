import { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export default function PageHeader({
  title,
  description,
  action,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-[28px] font-black tracking-[-0.02em] text-[#111827]">
            {title}
          </h1>
          <span className="text-[18px] text-[#9ca3af]">ⓘ</span>
        </div>

        <p className="mt-3 text-[14px] leading-7 text-[#6b7280]">
          {description}
        </p>
      </div>

      {action ? <div>{action}</div> : null}
    </div>
  );
}