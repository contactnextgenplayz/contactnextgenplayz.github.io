import type { APIRoute } from "astro";
import { securityTxtResponse } from "@/lib/securityTxt";

export const GET: APIRoute = () => securityTxtResponse("well-known");
