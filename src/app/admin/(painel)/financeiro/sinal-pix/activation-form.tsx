"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { COMPANY_TYPES, type ActivationInput } from "@/modules/asaas/fields";

import { activateAction, type SinalActionResult } from "./actions";

const ERROR = "Não foi possível enviar. Tente novamente.";

export function ActivationForm({
  defaults,
}: {
  defaults: Pick<ActivationInput, "name" | "email" | "mobilePhone" | "address">;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ActivationInput>({
    name: defaults.name,
    email: defaults.email,
    cpfCnpj: "",
    birthDate: "",
    companyType: "",
    mobilePhone: defaults.mobilePhone,
    incomeValue: "",
    postalCode: "",
    address: defaults.address,
    addressNumber: "",
    province: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isCompany = values.cpfCnpj.replace(/\D/g, "").length > 11;

  function field(
    name: keyof ActivationInput,
    label: string,
    props: React.ComponentProps<"input"> = {},
  ) {
    const id = `sinal-${name}`;
    return (
      <div className="grid content-start gap-1">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          value={values[name] ?? ""}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `${id}-erro` : undefined}
          onChange={(event) =>
            setValues((v) => ({ ...v, [name]: event.target.value }))
          }
          {...props}
        />
        <FieldError id={`${id}-erro`} message={errors[name]} />
      </div>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    let result: SinalActionResult;
    try {
      result = await activateAction(values);
    } catch {
      result = { ok: false, formError: ERROR };
    }
    setSaving(false);
    if (result.ok) {
      setErrors({});
      setFormError(null);
      router.refresh();
      return;
    }
    setErrors(result.fieldErrors ?? {});
    setFormError(result.formError ?? "Confira os campos destacados.");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        {field("name", "Nome ou razão social", { autoComplete: "name" })}
      </div>
      {field("email", "E-mail", { type: "email", autoComplete: "email" })}
      {field("cpfCnpj", "CPF ou CNPJ", { inputMode: "numeric" })}
      {isCompany ? (
        <div className="grid content-start gap-1">
          <Label htmlFor="sinal-companyType">Tipo de empresa</Label>
          <NativeSelect
            id="sinal-companyType"
            value={values.companyType ?? ""}
            aria-invalid={Boolean(errors.companyType)}
            onChange={(event) =>
              setValues((v) => ({ ...v, companyType: event.target.value }))
            }
          >
            <option value="">Escolha</option>
            {COMPANY_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </NativeSelect>
          <FieldError
            id="sinal-companyType-erro"
            message={errors.companyType}
          />
        </div>
      ) : (
        field("birthDate", "Data de nascimento", { type: "date" })
      )}
      {field("mobilePhone", "Celular", {
        inputMode: "tel",
        autoComplete: "tel",
      })}
      {field("incomeValue", isCompany ? "Faturamento mensal" : "Renda mensal", {
        inputMode: "decimal",
        placeholder: "R$ 5.000,00",
      })}
      {field("postalCode", "CEP", {
        inputMode: "numeric",
        autoComplete: "postal-code",
      })}
      <div className="md:col-span-2">
        {field("address", "Endereço", { autoComplete: "street-address" })}
      </div>
      {field("addressNumber", "Número")}
      {field("province", "Bairro")}
      <div className="grid gap-2 md:col-span-2">
        <FormError message={formError} />
        <Button type="submit" disabled={saving} className="w-fit">
          {saving ? "Enviando..." : "Ativar recebimentos"}
        </Button>
      </div>
    </form>
  );
}
