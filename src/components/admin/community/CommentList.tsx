import React from "react";
import Badge from "@/components/ui/badge/Badge";
import type { CommunityComment } from "@/types/community";
import { formatDistanceToNow } from "date-fns";

type CommentListProps = {
  comments: CommunityComment[];
  onHide?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRestore?: (id: string) => void;
};

export default function CommentList({ comments, onHide, onDelete, onRestore }: CommentListProps) {
  if (comments.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-800 dark:bg-white/[0.02]">
        <p className="text-sm text-gray-500 dark:text-gray-400">No comments yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {comments.map((comment) => {
        const isDeleted = comment.status === "deleted";
        const isHidden = comment.status === "hidden";

        return (
          <div
            key={comment.id}
            className={`rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.02] ${
              isDeleted ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {comment.author_email}
                  </p>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({comment.author_role}) · {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                  </span>
                  {isHidden && <Badge color="warning" size="sm">Hidden</Badge>}
                  {isDeleted && <Badge color="error" size="sm">Deleted</Badge>}
                </div>
                
                <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                  <div dangerouslySetInnerHTML={{ __html: comment.content }} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isHidden && onRestore && (
                  <button
                    onClick={() => onRestore(comment.id)}
                    className="text-xs font-medium text-success-600 hover:underline dark:text-success-400"
                  >
                    Restore
                  </button>
                )}
                {comment.status === "active" && onHide && (
                  <button
                    onClick={() => onHide(comment.id)}
                    className="text-xs font-medium text-warning-600 hover:underline dark:text-warning-400"
                  >
                    Hide
                  </button>
                )}
                {!isDeleted && onDelete && (
                  <button
                    onClick={() => onDelete(comment.id)}
                    className="text-xs font-medium text-error-600 hover:underline dark:text-error-400"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
