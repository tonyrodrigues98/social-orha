import { useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Check, X } from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { Drawer } from "@/components/godui/drawer";
import type { PixelCrop } from "@/domain/profile-media";

export function ProfileImageCropDrawer({
  file,
  purpose = "cover",
  busy,
  onCancel,
  onConfirm,
}: {
  file: File;
  purpose?: "avatar" | "cover";
  busy: boolean;
  onCancel: () => void;
  onConfirm: (crop: PixelCrop) => void;
}) {
  const [previewUrl] = useState(() => URL.createObjectURL(file));
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState<Area | null>(null);
  const isAvatar = purpose === "avatar";

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
      title={isAvatar ? "Ajustar foto de perfil" : "Ajustar imagem de capa"}
    >
      <div className="grid gap-4" aria-busy={busy || undefined}>
        <p className="m-0 text-sm text-muted-foreground">
          Arraste para enquadrar. Use o controle de zoom para aproximar.
        </p>
        <div className="relative h-[min(52vh,390px)] min-h-64 overflow-hidden rounded-2xl bg-black">
          <Cropper
            image={previewUrl}
            crop={crop}
            zoom={zoom}
            aspect={isAvatar ? 1 : 16 / 9}
            objectFit="contain"
            showGrid
            cropShape={isAvatar ? "round" : "rect"}
            roundCropAreaPixels
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_area, pixels) => {
              setCropPixels(pixels);
            }}
            mediaProps={{ alt: isAvatar ? "Prévia da foto de perfil" : "Prévia da imagem de capa" }}
            cropperProps={{ "aria-label": isAvatar ? "Editor da foto de perfil" : "Editor de enquadramento da capa" }}
          />
        </div>
        <label className="grid min-h-11 gap-2 text-sm font-medium">
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            disabled={busy}
            onChange={(event) => setZoom(Number(event.target.value))}
            aria-valuetext={`${Math.round(zoom * 100)}%`}
          />
        </label>
        <div className="grid grid-cols-2 gap-3 pb-[env(safe-area-inset-bottom)]">
          <Button
            color="secondary"
            size="lg"
            iconLeading={X}
            isDisabled={busy}
            onPress={onCancel}
          >
            Cancelar
          </Button>
          <Button
            size="lg"
            iconLeading={Check}
            isDisabled={!cropPixels || busy}
            isLoading={busy}
            showTextWhileLoading
            onPress={() => {
              if (cropPixels) onConfirm(cropPixels);
            }}
          >
            {busy ? "Salvando…" : isAvatar ? "Usar esta foto" : "Usar esta capa"}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
