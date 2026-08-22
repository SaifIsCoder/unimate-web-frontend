"use client";

import React, { useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import FeedbackBanner, { errorMessage, type Feedback } from "@/components/admin/FeedbackBanner";
import PostCard from "@/components/admin/community/PostCard";
import CommentList from "@/components/admin/community/CommentList";
import {
  deleteComment,
  getPostDetail,
  updateCommentStatus,
  updatePostStatus,
  deletePost,
} from "@/services/communityService";
import type { CommunityPostDetail } from "@/types/community";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { useRouter } from "next/navigation";

type PostDetailPageProps = {
  params: { postId: string };
};

export default function PostDetailPage({ params }: PostDetailPageProps) {
  const router = useRouter();
  const [postDetail, setPostDetail] = useState<CommunityPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Post Mutations
  const [pendingPostDelete, setPendingPostDelete] = useState(false);
  const [pendingPostHide, setPendingPostHide] = useState(false);
  const [pendingPostRestore, setPendingPostRestore] = useState(false);

  // Comment Mutations
  const [pendingCommentDelete, setPendingCommentDelete] = useState<string | null>(null);
  const [pendingCommentHide, setPendingCommentHide] = useState<string | null>(null);
  const [pendingCommentRestore, setPendingCommentRestore] = useState<string | null>(null);

  const [mutating, setMutating] = useState(false);

  const fetchPost = async (p: number, resetLoading = true) => {
    if (resetLoading) setLoading(true);
    setFeedback(null);
    try {
      const response = await getPostDetail(params.postId, { page: p, limit: 50 });
      setPostDetail(response);
      setPage(p);
    } catch (err) {
      setFeedback({
        variant: "error",
        title: "Could not load post",
        message: errorMessage(err, "The post may have been deleted or you don't have access."),
      });
    } finally {
      if (resetLoading) setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const response = await getPostDetail(params.postId, { page: 1, limit: 50 });
        if (!alive) return;
        setPostDetail(response);
        setPage(1);
      } catch (err) {
        if (!alive) return;
        setFeedback({
          variant: "error",
          title: "Could not load post",
          message: errorMessage(err, "The post may have been deleted or you don't have access."),
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [params.postId]);

  // Handle Post Actions
  const handlePostDelete = async () => {
    setMutating(true);
    try {
      await deletePost(params.postId);
      router.push("/admin/community");
    } catch (err) {
      setFeedback({
        variant: "error",
        title: "Could not delete post",
        message: errorMessage(err, "An error occurred while deleting the post."),
      });
      setMutating(false);
      setPendingPostDelete(false);
    }
  };

  const handlePostHide = async () => {
    setMutating(true);
    try {
      const updated = await updatePostStatus(params.postId, "hidden");
      if (postDetail) setPostDetail({ ...postDetail, status: updated.status });
      setPendingPostHide(false);
    } catch (err) {
      setFeedback({
        variant: "error",
        title: "Could not hide post",
        message: errorMessage(err, "An error occurred while hiding the post."),
      });
    } finally {
      setMutating(false);
    }
  };

  const handlePostRestore = async () => {
    setMutating(true);
    try {
      const updated = await updatePostStatus(params.postId, "active");
      if (postDetail) setPostDetail({ ...postDetail, status: updated.status });
      setPendingPostRestore(false);
    } catch (err) {
      setFeedback({
        variant: "error",
        title: "Could not restore post",
        message: errorMessage(err, "An error occurred while restoring the post."),
      });
    } finally {
      setMutating(false);
    }
  };

  // Handle Comment Actions
  const handleCommentAction = async (
    id: string,
    actionFn: () => Promise<any>,
    successStatus?: "hidden" | "active"
  ) => {
    setMutating(true);
    try {
      await actionFn();
      if (postDetail) {
        // Optimistically update comment list without refetching
        setPostDetail({
          ...postDetail,
          comments: {
            ...postDetail.comments,
            data: postDetail.comments.data.filter(c => 
              successStatus ? true : c.id !== id
            ).map(c => 
              c.id === id && successStatus ? { ...c, status: successStatus } : c
            )
          }
        });
      }
    } catch (err) {
      setFeedback({
        variant: "error",
        title: "Could not moderate comment",
        message: errorMessage(err, "An error occurred while moderating the comment."),
      });
    } finally {
      setMutating(false);
      setPendingCommentDelete(null);
      setPendingCommentHide(null);
      setPendingCommentRestore(null);
    }
  };

  if (loading) {
    return (
      <div>
        <PageBreadcrumb pageTitle="Community Moderation" />
        <div className="h-48 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (!postDetail && !loading) {
    return (
      <div>
        <PageBreadcrumb pageTitle="Community Moderation" />
        <FeedbackBanner feedback={feedback} />
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">
          Post not found.
        </div>
      </div>
    );
  }

  if (!postDetail) return null;

  const totalPages = Math.ceil(
    postDetail.comments.meta.total / postDetail.comments.meta.limit
  ) || 1;

  return (
    <div>
      <PageBreadcrumb pageTitle="Post Detail" />

      <div className="space-y-6">
        <FeedbackBanner feedback={feedback} />

        <PostCard
          post={postDetail}
          isDetail={true}
          onHide={() => setPendingPostHide(true)}
          onDelete={() => setPendingPostDelete(true)}
          onRestore={() => setPendingPostRestore(true)}
        />

        <div>
          <h3 className="mb-4 text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Comments ({postDetail.comments.meta.total})
          </h3>
          <CommentList
            comments={postDetail.comments.data}
            onHide={(id) => setPendingCommentHide(id)}
            onDelete={(id) => setPendingCommentDelete(id)}
            onRestore={(id) => setPendingCommentRestore(id)}
          />

          {/* Pagination Controls for Comments */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4 dark:border-gray-800">
              <button
                onClick={() => void fetchPost(page - 1)}
                disabled={page === 1}
                className="rounded px-3 py-1 text-sm font-medium text-gray-700 disabled:opacity-50 dark:text-gray-300"
              >
                &larr; Previous
              </button>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => void fetchPost(page + 1)}
                disabled={page === totalPages}
                className="rounded px-3 py-1 text-sm font-medium text-gray-700 disabled:opacity-50 dark:text-gray-300"
              >
                Next &rarr;
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Post Confirm Dialogs */}
      <ConfirmDialog
        open={pendingPostDelete}
        destructive
        busy={mutating}
        title="Delete Post?"
        confirmLabel="Delete"
        message="This will permanently delete the post and return you to the feed."
        onConfirm={handlePostDelete}
        onCancel={() => setPendingPostDelete(false)}
      />
      <ConfirmDialog
        open={pendingPostHide}
        busy={mutating}
        title="Hide Post?"
        confirmLabel="Hide"
        message="This will hide the post from the community feed."
        onConfirm={handlePostHide}
        onCancel={() => setPendingPostHide(false)}
      />
      <ConfirmDialog
        open={pendingPostRestore}
        busy={mutating}
        title="Restore Post?"
        confirmLabel="Restore"
        message="This will make the post visible to the community again."
        onConfirm={handlePostRestore}
        onCancel={() => setPendingPostRestore(false)}
      />

      {/* Comment Confirm Dialogs */}
      <ConfirmDialog
        open={pendingCommentDelete !== null}
        destructive
        busy={mutating}
        title="Delete Comment?"
        confirmLabel="Delete"
        message="This will permanently delete the comment."
        onConfirm={() => handleCommentAction(pendingCommentDelete as string, () => deleteComment(pendingCommentDelete as string))}
        onCancel={() => setPendingCommentDelete(null)}
      />
      <ConfirmDialog
        open={pendingCommentHide !== null}
        busy={mutating}
        title="Hide Comment?"
        confirmLabel="Hide"
        message="This will hide the comment from the community feed."
        onConfirm={() => handleCommentAction(pendingCommentHide as string, () => updateCommentStatus(pendingCommentHide as string, "hidden"), "hidden")}
        onCancel={() => setPendingCommentHide(null)}
      />
      <ConfirmDialog
        open={pendingCommentRestore !== null}
        busy={mutating}
        title="Restore Comment?"
        confirmLabel="Restore"
        message="This will make the comment visible to the community again."
        onConfirm={() => handleCommentAction(pendingCommentRestore as string, () => updateCommentStatus(pendingCommentRestore as string, "active"), "active")}
        onCancel={() => setPendingCommentRestore(null)}
      />
    </div>
  );
}
