import type { APIRoute } from "astro";
import { securityTxtResponse } from "@/lib/securityTxt";

// Legacy location (RFC 9116 §3); /.well-known/security.txt is canonical.
export const GET: APIRoute = () => securityTxtResponse("legacy");
