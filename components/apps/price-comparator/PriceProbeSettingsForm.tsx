"use client";

import { useActionState } from "react";
import { Badge, Banner, Button, Card, Input } from "@/components/ui";
import { savePriceProbeKeys } from "@/actions/price-comparator";
import { idleState } from "@/lib/action-utils";

interface Configured {
  digikeyClientId: boolean;
  digikeyClientSecret: boolean;
  mouserApiKey: boolean;
  element14ApiKey: boolean;
}

function SecretField({
  label,
  name,
  isSet,
}: {
  label: string;
  name: string;
  isSet: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        {label}
        {isSet ? <Badge tone="success">Saved</Badge> : <Badge>Not set</Badge>}
      </div>
      <Input
        name={name}
        type="password"
        autoComplete="off"
        placeholder={isSet ? "Leave blank to keep the saved value" : "Paste here"}
        className="py-2"
      />
      {isSet && (
        <label className="flex items-center gap-2 text-xs text-gray-500">
          <input type="checkbox" name={`clear_${name}`} className="h-3.5 w-3.5 accent-brand" />
          Remove saved value
        </label>
      )}
    </div>
  );
}

const linkCls = "font-semibold text-brand hover:underline";

export function PriceProbeSettingsForm({ configured }: { configured: Configured }) {
  const [state, action, pending] = useActionState(savePriceProbeKeys, idleState);

  return (
    <form action={action} className="max-w-2xl space-y-4">
      <Card className="space-y-3 p-5">
        <h2 className="font-display text-base font-bold text-ink">DigiKey</h2>
        <p className="text-xs text-gray-500">
          Register a free app at{" "}
          <a href="https://developer.digikey.com" target="_blank" rel="noreferrer" className={linkCls}>
            developer.digikey.com
          </a>{" "}
          (organization → production app with “Product Information V4”), then paste the
          Client ID and Client Secret.
        </p>
        <SecretField label="Client ID" name="digikey_client_id" isSet={configured.digikeyClientId} />
        <SecretField
          label="Client Secret"
          name="digikey_client_secret"
          isSet={configured.digikeyClientSecret}
        />
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-display text-base font-bold text-ink">Mouser</h2>
        <p className="text-xs text-gray-500">
          Request a free Search API key at{" "}
          <a href="https://www.mouser.com/api-search/" target="_blank" rel="noreferrer" className={linkCls}>
            mouser.com/api-search
          </a>{" "}
          (arrives by email).
        </p>
        <SecretField label="API Key" name="mouser_api_key" isSet={configured.mouserApiKey} />
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-display text-base font-bold text-ink">element14 (India)</h2>
        <p className="text-xs text-gray-500">
          Register at{" "}
          <a href="https://partner.element14.com" target="_blank" rel="noreferrer" className={linkCls}>
            partner.element14.com
          </a>{" "}
          and create an app for a Product Search API key. Prices come from in.element14.com in
          INR.
        </p>
        <SecretField label="API Key" name="element14_api_key" isSet={configured.element14ApiKey} />
      </Card>

      <p className="text-xs text-gray-400">
        Keys are stored server-side for the whole organization and are never sent to the browser
        — employees with PriceProbe access search with them without seeing them. The exchange
        rate override is on the Compare tab.
      </p>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save API keys"}
        </Button>
        {state.ok && state.message && (
          <span className="text-sm text-success-deep">{state.message}</span>
        )}
      </div>
      {state.error && <Banner tone="warning">{state.error}</Banner>}
    </form>
  );
}
