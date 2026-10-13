/**
 * Passkey accounts store a synthetic email. A Google, Discord, or X account has a different one.
 * Linking is allowed across those emails. Those three providers may link even when the
 * provider does not mark the email verified. Unlinking the last account stays allowed
 * because a passkey is not an account row.
 */
export const accountLinking = {
    allowUnlinkingAll: true,
    allowDifferentEmails: true,
    trustedProviders: ['google', 'discord', 'twitter'],
};
