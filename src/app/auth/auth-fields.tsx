import type { ComponentType, HTMLAttributes } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Input } from "@/components/base/input/input";

type ControlledInputProps<TValues extends FieldValues> = {
  control: Control<TValues>;
  name: FieldPath<TValues>;
  label: string;
  placeholder?: string;
  type?: string;
  icon?: ComponentType<HTMLAttributes<HTMLOrSVGElement>>;
  autoComplete?: string;
  variant?: "default" | "access";
  rules?: Parameters<typeof Controller<TValues>>[0]["rules"];
};

export function ControlledInput<TValues extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  type,
  icon,
  autoComplete,
  variant = "default",
  rules,
}: ControlledInputProps<TValues>) {
  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => (
        <Input
          label={label}
          placeholder={placeholder}
          type={type}
          icon={icon}
          name={field.name}
          value={field.value ?? ""}
          onChange={field.onChange}
          onBlur={field.onBlur}
          ref={field.ref}
          autoComplete={autoComplete}
          isInvalid={fieldState.invalid}
          hint={fieldState.error?.message}
          size="lg"
          className={variant === "access" ? "access-field" : "orha-field"}
          wrapperClassName={variant === "access" ? "access-field-control" : "orha-field-control"}
          inputClassName={variant === "access" ? "access-field-input" : "orha-field-input"}
        />
      )}
    />
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="auth-error" role="alert">{message}</div>;
}

