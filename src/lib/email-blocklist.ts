/**
 * Disposable email domain blocklist.
 * Used during signup to reject throwaway/temporary email addresses.
 * Encourages use of real business email addresses.
 */

/**
 * Known disposable/temporary email domains.
 * Expanded list of 60+ providers commonly used to bypass email verification.
 */
const DISPOSABLE_DOMAINS = new Set<string>([
  // Major disposable services
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamail.biz",
  "guerrillamail.de",
  "guerrillamailblock.com",
  "10minutemail.com",
  "10minutemail.net",
  "10minutemail.org",
  "tempmail.com",
  "tempmail.net",
  "temp-mail.org",
  "throwam.com",
  "fakeinbox.com",
  "sharklasers.com",
  "grr.la",
  "spam4.me",
  "trashmail.com",
  "trashmail.at",
  "trashmail.io",
  "trashmail.me",
  "trashmail.net",
  "trashmail.org",
  "yopmail.com",
  "yopmail.fr",
  "maildrop.cc",
  "dispostable.com",
  "mailnull.com",
  "spamgourmet.com",
  "discard.email",
  "spamex.com",
  "spamfree24.org",
  // Additional well-known disposable providers
  "mailnesia.com",
  "mailforspam.com",
  "spamthisplease.com",
  "throwaway.email",
  "getnada.com",
  "nada.email",
  "burnermail.io",
  "tempinbox.com",
  "mailtemp.net",
  "spamgourmet.net",
  "spamgourmet.org",
  "mytrashmail.com",
  "mailexpire.com",
  "spamherelots.com",
  "spamhereplease.com",
  "spamspot.com",
  "spamthisplease.com",
  "tempr.email",
  "trbvm.com",
  "emlpro.com",
  "emltmp.com",
  "emlhub.com",
  "spambox.us",
  "spambox.org",
  "spam.la",
  "jetable.com",
  "jetable.fr.nf",
  "jetable.net",
  "jetable.org",
  "nospamfor.us",
  "dodgit.com",
  "antispam24.de",
  "binkmail.com",
  "bobmail.info",
  "chammy.info",
  "devnullmail.com",
  "fudgerub.com",
  "ieatspam.eu",
  "ieatspam.info",
  "inoutmail.eu",
  "inoutmail.de",
  "inoutmail.net",
  "inoutmail.info",
  "joliekemulder.com",
  "lifebyfood.com",
  "lookugly.com",
  "lovemeleaveme.com",
  "objectmail.com",
  "obobbo.com",
  "oneoffemail.com",
  "onewaymail.com",
  "rppkn.com",
  "rtrtr.com",
  "s0ny.net",
  "safe-mail.net",
  "spamgob.com",
  "supergreatmail.com",
  "superstachel.de",
  "teewars.org",
  "tempalias.com",
  "tempail.com",
  "tempe-mail.com",
  "tempinbox.co.uk",
  "temporaryinbox.com",
  "thankyou2010.com",
  "thisisnotmyrealemail.com",
  "tradermail.info",
  "uggsrock.com",
  "wegwerfmail.de",
  "wegwerfmail.net",
  "wegwerfmail.org",
  "zippymail.info",
]);

/**
 * Checks if the given email domain is on the disposable email blocklist.
 *
 * @param domain - The domain portion of an email (e.g. "mailinator.com")
 * @returns true if domain is a known disposable email provider
 */
export function isBlockedDomain(domain: string): boolean {
  if (!domain || typeof domain !== "string") return false;
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase().trim());
}

/**
 * Checks if the given email address uses a disposable email domain.
 *
 * @param email - Full email address (e.g. "user@mailinator.com")
 * @returns true if the email uses a known disposable provider
 */
export function isDisposableEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;

  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) return false;

  const domain = email.slice(atIndex + 1);
  return isBlockedDomain(domain);
}
