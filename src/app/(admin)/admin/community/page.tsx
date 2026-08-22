"use client";

import React, { useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import FeedbackBanner, { errorMessage, type Feedback } from "@/components/admin/FeedbackBanner";
import PostCard from "@/components/admin/community/PostCard";
import { deletePost, listPosts, updatePostStatus } from "@/services/communityService";
import type { CommunityPost } from "@/types/community";
import ConfirmDialog from "@/components/admin/ConfirmDialog";

export default function CommunityModerationPage() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [pendingDelete, setPendingDelete] = useState<CommunityPost | null>(null);
  const [pendingHide, setPendingHide] = useState<CommunityPost | null>(null);
  const [pendingRestore, setPendingRestore] = useState<CommunityPost | null>(null);
  const [mutating, setMutating] = useState(false);

  const fetchPage = async (p: number, resetLoading = true) => {
    if (resetLoading) setLoading(true);
    setFeedback(null);
    try {
      const response = await listPosts({ page: p, limit: 10 });
      setPosts(response.data);
      setTotalPages(Math.ceil(response.meta.total / response.meta.limit) || 1);
      setPage(p);
    } catch (err) {
      setFeedback({
        variant: "error",
        title: "Could not load posts",
        message: errorMessage(err, "Ensure you are assigned to a department to moderate."),
      });
    } finally {
      if (resetLoading) setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const response = await listPosts({ page: 1, limit: 10 });
        if (!alive) return;
        setPosts(response.data);
        setTotalPages(Math.ceil(response.meta.total / response.meta.limit) || 1);
        setPage(1);
      } catch (err) {
        if (!alive) return;
        setFeedback({
          variant: "error",
          title: "Could not load posts",
          message: errorMessage(err, "Ensure you are assigned to a department to moderate."),
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const handleAction = async (
    actionName: string,
    actionFn: () => Promise<CommunityPost>,
    successMessage: string
  ) => {
    setMutating(true);
    try {
      const updated = await actionFn();
      setPosts((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, status: updated.status } : p))
      );
      setFeedback({
        variant: "success",
        title: "Action successful",
        message: successMessage,
      });
    } catch (err) {
      setFeedback({
        variant: "error",
        title: `Could not ${actionName} post`,
        message: errorMessage(err, "The server rejected the request."),
      });
    } finally {
      setMutating(false);
      setPendingDelete(null);
      setPendingHide(null);
      setPendingRestore(null);
    }
  };

  const executeDelete = () => {
    if (!pendingDelete) return;
    void handleAction("delete", () => deletePost(pendingDelete.id), "Post has been deleted.");
  };

  const executeHide = () => {
    if (!pendingHide) return;
    void handleAction(
      "hide",
      () => updatePostStatus(pendingHide.id, "hidden"),
      "Post has been hidden from the feed."
    );
  };

  const executeRestore = () => {
    if (!pendingRestore) return;
    void handleAction(
      "restore",
      () => updatePostStatus(pendingRestore.id, "active"),
      "Post is now visible in the feed again."
    );
  };

  return (
    <div>
      <PageBreadcrumb pageTitle="Community Moderation" />

      <div className="space-y-6">
        <FeedbackBanner feedback={feedback} />

        <ComponentCard
          title="Department Feed"
          desc="Moderate posts within your assigned department."
        >
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              No posts found in this department.
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onHide={() => setPendingHide(post)}
                  onDelete={() => setPendingDelete(post)}
                  onRestore={() => setPendingRestore(post)}
                />
              ))}

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4 dark:border-gray-800">
                  <button
                    onClick={() => void fetchPage(page - 1)}
                    disabled={page === 1}
                    className="rounded px-3 py-1 text-sm font-medium text-gray-700 disabled:opacity-50 dark:text-gray-300"
                  >
                    &larr; Previous
                  </button>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => void fetchPage(page + 1)}
                    disabled={page === totalPages}
                    className="rounded px-3 py-1 text-sm font-medium text-gray-700 disabled:opacity-50 dark:text-gray-300"
                  >
                    Next &rarr;
                  </button>
                </div>
              )}
            </div>
          )}
        </ComponentCard>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        destructive
        busy={mutating}
        title="Delete Post?"
        confirmLabel="Delete"
        message="This will permanently delete the post and it will no longer be visible to anyone."
        onConfirm={executeDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={pendingHide !== null}
        busy={mutating}
        title="Hide Post?"
        confirmLabel="Hide"
        message="This will hide the post from the community feed. You can restore it later."
        onConfirm={executeHide}
        onCancel={() => setPendingHide(null)}
      />

      <ConfirmDialog
        open={pendingRestore !== null}
        busy={mutating}
        title="Restore Post?"
        confirmLabel="Restore"
        message="This will make the post visible to the community again."
        onConfirm={executeRestore}
        onCancel={() => setPendingRestore(null)}
      />
    </div>
  );
}
