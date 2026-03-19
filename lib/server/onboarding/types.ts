export type SignupStatus = "pending" | "verified" | "provisioned" | "expired" | "cancelled"

export type SignupRequestRecord = {
  id: string
  name: string
  email: string
  normalized_email: string
  estate_name: string
  country: string | null
  preferred_locale: string | null
  password_hash: string
  status: SignupStatus
  source: string | null
  tenant_id: string | null
  user_id: string | null
  generated_username: string | null
  verification_sent_at: string | null
  created_at: string | null
  verified_at: string | null
  provisioned_at: string | null
  provisioning_error: string | null
  last_ip_address: string | null
  last_user_agent: string | null
}

export type SignupTokenRecord = {
  id: string
  signup_request_id: string
  token_hash: string
  purpose: "verify_email"
  expires_at: string
  consumed_at: string | null
  created_at: string | null
}

export type SignupVerificationLookup = SignupRequestRecord & {
  token_id: string
  token_expires_at: string
  token_consumed_at: string | null
}

export type SignupRequestResult = {
  signupRequestId: string
  email: string
  maskedEmail: string
  verificationSent: boolean
}

export type SignupVerificationResult = {
  email: string
  tenantId: string
  tenantName: string
  userId: string
  username: string
  loginIdentifier: string
}

