import { Prisma } from "@prisma/client";
import { validateDnsRotator } from "./dns-rotator";
import { validateBitrates, validateTimeshiftSeconds } from "./stream-variants";

export function parseStreamAdvancedFields(body: Record<string, unknown>) {
  const timeshiftSeconds =
    body.timeshiftSeconds != null && body.timeshiftSeconds !== ""
      ? Number(body.timeshiftSeconds)
      : null;
  const isShifted = Boolean(body.isShifted) || (timeshiftSeconds != null && timeshiftSeconds > 0);
  const parentStreamId =
    body.parentStreamId && String(body.parentStreamId).trim()
      ? String(body.parentStreamId).trim()
      : null;

  let dnsRotator: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
  if (body.dnsRotator !== undefined) {
    if (body.dnsRotator == null || body.dnsRotator === "") {
      dnsRotator = Prisma.JsonNull;
    } else {
      dnsRotator = body.dnsRotator as Prisma.InputJsonValue;
    }
  }

  let bitrates: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
  if (body.bitrates !== undefined) {
    if (body.bitrates == null || (Array.isArray(body.bitrates) && body.bitrates.length === 0)) {
      bitrates = Prisma.JsonNull;
    } else {
      bitrates = body.bitrates as Prisma.InputJsonValue;
    }
  }

  return {
    timeshiftSeconds,
    isShifted,
    parentStreamId,
    dnsRotator,
    bitrates,
    autoRestart: body.autoRestart !== undefined ? Boolean(body.autoRestart) : undefined,
    isCreatedChannel:
      body.isCreatedChannel !== undefined ? Boolean(body.isCreatedChannel) : undefined,
    isRadio: body.isRadio !== undefined ? Boolean(body.isRadio) : undefined,
  };
}

export function validateStreamAdvancedFields(body: Record<string, unknown>): string | null {
  const tsErr = validateTimeshiftSeconds(body.timeshiftSeconds);
  if (tsErr) return tsErr;
  if (body.dnsRotator != null && body.dnsRotator !== "") {
    const err = validateDnsRotator(body.dnsRotator);
    if (err) return err;
  }
  if (body.bitrates != null && body.bitrates !== "" && !(Array.isArray(body.bitrates) && body.bitrates.length === 0)) {
    const err = validateBitrates(body.bitrates);
    if (err) return err;
  }
  return null;
}
