type BrandMarkProps = {
  variant?: "primary" | "soft";
  className?: string;
};

export function BrandMark({
  variant = "primary",
  className = "",
}: BrandMarkProps) {
  return (
    <img
      className={`brand-mark ${className}`}
      src={
        variant === "primary"
          ? "/brand/orha-splash-primary.jpg"
          : "/brand/orha-splash-soft.jpg"
      }
      alt="ORHA"
      draggable={false}
    />
  );
}
