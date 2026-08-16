type BrandMarkProps = {
  className?: string;
};

export function BrandMark({
  className = "",
}: BrandMarkProps) {
  const assetBase = import.meta.env.BASE_URL;

  return (
    <img
      className={`brand-mark ${className}`}
      src={`${assetBase}brand/orha-mark-transparent.png`}
      width="697"
      height="177"
      alt="ORHA"
      draggable={false}
    />
  );
}
