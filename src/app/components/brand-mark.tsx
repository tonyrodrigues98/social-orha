type BrandMarkProps = {
  variant?: "primary" | "soft";
  className?: string;
};

export function BrandMark({
  variant = "primary",
  className = "",
}: BrandMarkProps) {
  const assetBase = import.meta.env.BASE_URL;

  return (
    <img
      className={`brand-mark ${className}`}
      src={
        variant === "primary"
          ? `${assetBase}brand/orha-splash-primary.jpg`
          : `${assetBase}brand/orha-splash-soft.jpg`
      }
      alt="ORHA"
      draggable={false}
    />
  );
}
