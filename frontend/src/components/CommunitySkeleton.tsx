import "./CommunitySkeleton.css";

type CommunitySkeletonVariant = "feed" | "comments" | "videoComments" | "profile" | "profilePosts" | "search";

type CommunitySkeletonProps = {
  variant: CommunitySkeletonVariant;
  count?: number;
};

const Block = ({ className = "" }: { className?: string }) => (
  <span className={`community-skeleton-block ${className}`} aria-hidden="true" />
);

const FeedPostSkeleton = ({ index }: { index: number }) => (
  <article className="community-skeleton-feed-post" aria-hidden="true">
    <header className="community-skeleton-feed-header">
      <Block className="community-skeleton-feed-avatar" />
      <div className="community-skeleton-feed-identity">
        <Block className="community-skeleton-feed-name" />
        <Block className="community-skeleton-feed-headline" />
        <Block className="community-skeleton-feed-time" />
      </div>
      <Block className="community-skeleton-follow" />
      <Block className="community-skeleton-icon" />
      <Block className="community-skeleton-icon" />
    </header>
    <div className="community-skeleton-feed-content">
      <Block />
      <Block className="community-skeleton-line-medium" />
      <Block className="community-skeleton-line-short" />
    </div>
    {index % 2 === 0 ? <Block className="community-skeleton-feed-media" /> : null}
    <div className="community-skeleton-feed-actions">
      {Array.from({ length: 4 }).map((_, actionIndex) => (
        <span className="community-skeleton-action" key={actionIndex}>
          <Block className="community-skeleton-action-icon" />
          <Block className="community-skeleton-action-count" />
        </span>
      ))}
      <span className="community-skeleton-reactions">
        <Block className="community-skeleton-reaction" />
        <Block className="community-skeleton-reaction" />
      </span>
    </div>
  </article>
);

const CommentSkeleton = ({ video = false }: { video?: boolean }) => (
  <article className={`community-skeleton-comment${video ? " community-skeleton-comment-video" : ""}`} aria-hidden="true">
    <Block className="community-skeleton-comment-avatar" />
    <div className="community-skeleton-comment-copy">
      <Block className="community-skeleton-comment-name" />
      <Block />
      {video ? null : <Block className="community-skeleton-line-short" />}
    </div>
  </article>
);

const ProfilePostSkeleton = ({ index }: { index: number }) => (
  <article className="community-skeleton-profile-post" aria-hidden="true">
    <header className="community-skeleton-profile-post-header">
      <Block className="community-skeleton-profile-post-avatar" />
      <div className="community-skeleton-profile-post-identity">
        <Block className="community-skeleton-feed-name" />
        <Block className="community-skeleton-feed-time" />
      </div>
      <Block className="community-skeleton-icon" />
    </header>
    <div className="community-skeleton-profile-post-content">
      <Block />
      <Block className="community-skeleton-line-medium" />
    </div>
    {index % 2 === 0 ? <Block className="community-skeleton-profile-post-media" /> : null}
    <div className="community-skeleton-profile-post-counts">
      <Block className="community-skeleton-line-short" />
      <Block className="community-skeleton-line-short" />
      <Block className="community-skeleton-line-short" />
    </div>
    <div className="community-skeleton-profile-post-actions">
      {Array.from({ length: 4 }).map((_, actionIndex) => (
        <Block className="community-skeleton-profile-post-action" key={actionIndex} />
      ))}
    </div>
  </article>
);

const CommunitySkeleton = ({ variant, count = 3 }: CommunitySkeletonProps) => {
  if (variant === "feed") {
    return (
      <section className="community-skeleton community-skeleton-feed" aria-label="Loading community posts" aria-busy="true">
        {Array.from({ length: count }).map((_, index) => <FeedPostSkeleton key={index} index={index} />)}
      </section>
    );
  }

  if (variant === "comments" || variant === "videoComments") {
    const video = variant === "videoComments";
    return (
      <section className={`community-skeleton community-skeleton-comments${video ? " video" : ""}`} aria-label="Loading comments" aria-busy="true">
        {Array.from({ length: count }).map((_, index) => <CommentSkeleton key={index} video={video} />)}
      </section>
    );
  }

  if (variant === "profilePosts") {
    return (
      <section className="community-skeleton-profile-posts" aria-label="Loading profile posts" aria-busy="true">
        {Array.from({ length: count }).map((_, index) => <ProfilePostSkeleton key={index} index={index} />)}
      </section>
    );
  }

  if (variant === "search") {
    return (
      <section className="community-skeleton community-skeleton-search" aria-label="Loading search results" aria-busy="true">
        <div className="community-skeleton-search-groups" aria-hidden="true">
          {[0, 1, 2].map(group => (
            <div className="community-skeleton-search-group" key={group}>
              <Block className="community-skeleton-search-heading" />
              {Array.from({ length: group === 0 ? 2 : 1 }).map((_, index) => (
                <Block className="community-skeleton-search-link" key={index} />
              ))}
            </div>
          ))}
        </div>
        <div className="community-skeleton-search-people" aria-hidden="true">
          <Block className="community-skeleton-search-heading" />
          {Array.from({ length: count }).map((_, index) => (
            <article className="community-skeleton-search-person" key={index}>
              <div className="community-skeleton-search-identity">
                <Block className="community-skeleton-search-avatar" />
                <span>
                  <Block className="community-skeleton-search-name" />
                  <Block className="community-skeleton-search-handle" />
                </span>
              </div>
              <Block className="community-skeleton-search-button" />
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="community-skeleton-profile" aria-label="Loading profile" aria-busy="true">
      <div className="community-skeleton-profile-hero" aria-hidden="true">
        <Block className="community-skeleton-profile-cover" />
        <div className="community-skeleton-profile-main">
          <Block className="community-skeleton-profile-avatar" />
          <div className="community-skeleton-profile-identity">
            <Block className="community-skeleton-profile-kicker" />
            <Block className="community-skeleton-profile-name" />
            <Block className="community-skeleton-profile-bio" />
            <Block className="community-skeleton-profile-hero-action" />
          </div>
          <div className="community-skeleton-profile-stats">
            {Array.from({ length: 3 }).map((_, index) => (
              <span key={index}>
                <Block className="community-skeleton-profile-stat-value" />
                <Block className="community-skeleton-profile-stat-label" />
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="community-skeleton-profile-panels" aria-hidden="true">
        {[0, 1].map(index => (
          <div className="community-skeleton-profile-panel" key={index}>
            <Block className="community-skeleton-profile-panel-title" />
            <Block />
            <Block className="community-skeleton-line-medium" />
            <Block className="community-skeleton-profile-panel-detail" />
          </div>
        ))}
      </div>
      <div className="community-skeleton-profile-post-section">
        <div className="community-skeleton-profile-post-heading" aria-hidden="true">
          <Block className="community-skeleton-profile-panel-title" />
          <Block className="community-skeleton-line-medium" />
        </div>
        <div className="community-skeleton-profile-posts">
          {[0, 1].map(index => <ProfilePostSkeleton key={index} index={index} />)}
        </div>
      </div>
    </section>
  );
};

export default CommunitySkeleton;
