export const visibleCv = (
  profile: any,
  actor: any,
  company?: any,
  application?: any,
) => {
  if (!profile?.cv || !actor) return undefined;
  const actorId = String(actor._id || actor.uid);
  if (profile.userId === actorId) return profile.cv;
  if (
    !company ||
    profile.blockedEmployerIds?.includes(company.slug) ||
    company.ownerId !== actorId
  )
    return undefined;
  // Historical public URLs are not safely revocable. Require a new protected upload.
  if (!profile.cv.protectedAsset) return undefined;
  if (
    profile.cv.visibility === "applications" &&
    application?.candidateId === profile.userId &&
    application?.employerId === actorId
  )
    return profile.cv;
  if (
    profile.cv.visibility === "verified_employers" &&
    company.verified === true &&
    company.moderationStatus === "approved"
  )
    return profile.cv;
  return undefined;
};
