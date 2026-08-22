import React from "react";
import Link from "next/link";
import Badge from "@/components/ui/badge/Badge";
import ComponentCard from "@/components/common/ComponentCard";
import type { CommunityPost } from "@/types/community";
import { formatDistanceToNow } from "date-fns";

type PostCardProps = {
  post: CommunityPost;
  isDetail?: boolean;
  onHide?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
};

export default function PostCard({
  post,
  isDetail = false,
  onHide,
  onDelete,
  onRestore,
}: PostCardProps) {
  const isDeleted = post.status === "deleted";
  const isHidden = post.status === "hidden";

  return (
    <ComponentCard className={isDeleted ? "opacity-60" : ""}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {isDetail ? (
                post.title
              ) : (
                <Link href={`/admin/community/${post.id}`} className="hover:underline">
                  {post.title}
                </Link>
              )}
            </h3>
            {isHidden && <Badge color="warning" size="sm">Hidden</Badge>}
            {isDeleted && <Badge color="error" size="sm">Deleted</Badge>}
            {post.status === "active" && <Badge color="success" size="sm">Active</Badge>}
          </div>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            By <span className="font-medium text-gray-700 dark:text-gray-300">{post.author_email}</span> ({post.author_role}) · {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isHidden && onRestore && (
            <button
              onClick={onRestore}
              className="rounded border border-success-300 px-3 py-1 text-xs font-medium text-success-600 transition hover:bg-success-50 dark:border-success-800 dark:text-success-400 dark:hover:bg-success-500/10"
            >
              Restore
            </button>
          )}
          {post.status === "active" && onHide && (
            <button
              onClick={onHide}
              className="rounded border border-warning-300 px-3 py-1 text-xs font-medium text-warning-600 transition hover:bg-warning-50 dark:border-warning-800 dark:text-warning-400 dark:hover:bg-warning-500/10"
            >
              Hide
            </button>
          )}
          {!isDeleted && onDelete && (
            <button
              onClick={onDelete}
              className="rounded border border-error-300 px-3 py-1 text-xs font-medium text-error-600 transition hover:bg-error-50 dark:border-error-800 dark:text-error-400 dark:hover:bg-error-500/10"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className={`mt-4 text-gray-700 dark:text-gray-300 ${!isDetail ? "line-clamp-3" : ""}`}>
        {/* If the backend sanitizes HTML, we can render it safely. Assuming raw text for now or simple HTML. */}
        <div dangerouslySetInnerHTML={{ __html: post.content }} />
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
          </svg>
          {post.like_count || 0} Likes
        </div>
        <div className="flex items-center gap-1">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          {post.comment_count || 0} Comments
        </div>
        
        {!isDetail && (
          <Link href={`/admin/community/${post.id}`} className="ml-auto font-medium text-brand-500 hover:underline">
            View full post &rarr;
          </Link>
        )}
      </div>
    </ComponentCard>
  );
}
