/**
 * GET /api/onboarding/signature-modal-available
 *
 * Lightweight probe used by Step 5 to detect whether the SignatureModal
 * component (Plan 02-04) has been built and is available in this deployment.
 *
 * Returns: { available: boolean }
 *
 * Once Plan 02-04 merges, this route can simply return { available: true }.
 * Step 5 will then swap the placeholder for the real SignatureModal.
 */

import { NextResponse } from "next/server";
import { existsSync } from "fs";
import path from "path";

export async function GET() {
  // Check if the SignatureModal component file exists in the build
  const componentPath = path.join(
    process.cwd(),
    "src",
    "components",
    "signature",
    "SignatureModal.tsx"
  );

  const available = existsSync(componentPath);

  return NextResponse.json({ available });
}
