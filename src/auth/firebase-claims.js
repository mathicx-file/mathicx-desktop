import { USER_ROLES } from '../firebase/firestore-paths.js';

export function hasAdminClaim(claims) {
  return claims?.admin === true;
}

export function roleFromClaims(claims) {
  return hasAdminClaim(claims) ? USER_ROLES.ADMIN : USER_ROLES.USER;
}
