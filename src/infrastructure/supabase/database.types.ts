export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_lifecycle_requests: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          execute_after: string
          id: string
          kind: Database["public"]["Enums"]["account_lifecycle_kind"]
          requested_at: string
          status: Database["public"]["Enums"]["account_lifecycle_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          execute_after: string
          id?: string
          kind: Database["public"]["Enums"]["account_lifecycle_kind"]
          requested_at?: string
          status?: Database["public"]["Enums"]["account_lifecycle_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          execute_after?: string
          id?: string
          kind?: Database["public"]["Enums"]["account_lifecycle_kind"]
          requested_at?: string
          status?: Database["public"]["Enums"]["account_lifecycle_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_lifecycle_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: number
          metadata: Json
          request_id: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: never
          metadata?: Json
          request_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: never
          metadata?: Json
          request_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
          reason: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          archived_at: string | null
          avatar_path: string | null
          cover_path: string | null
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string | null
          slug: string
          updated_at: string
          visibility: Database["public"]["Enums"]["community_visibility"]
        }
        Insert: {
          archived_at?: string | null
          avatar_path?: string | null
          cover_path?: string | null
          created_at?: string
          description?: string
          id?: string
          name: string
          owner_id?: string | null
          slug: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["community_visibility"]
        }
        Update: {
          archived_at?: string | null
          avatar_path?: string | null
          cover_path?: string | null
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner_id?: string | null
          slug?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["community_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "communities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_memberships: {
        Row: {
          community_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["community_role"]
          status: Database["public"]["Enums"]["community_membership_status"]
          updated_at: string
        }
        Insert: {
          community_id: string
          created_at?: string
          joined_at?: string | null
          profile_id: string
          role?: Database["public"]["Enums"]["community_role"]
          status?: Database["public"]["Enums"]["community_membership_status"]
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          joined_at?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["community_role"]
          status?: Database["public"]["Enums"]["community_membership_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_memberships_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_id: string | null
          body: string
          community_id: string | null
          created_at: string
          id: string
          status: Database["public"]["Enums"]["content_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["content_visibility"]
        }
        Insert: {
          author_id?: string | null
          body: string
          community_id?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["content_visibility"]
        }
        Update: {
          author_id?: string | null
          body?: string
          community_id?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["content_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_rules: {
        Row: {
          community_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          community_id: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_rules_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["conversation_member_role"]
          status: Database["public"]["Enums"]["conversation_member_status"]
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          joined_at?: string | null
          profile_id: string
          role?: Database["public"]["Enums"]["conversation_member_role"]
          status?: Database["public"]["Enums"]["conversation_member_status"]
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          joined_at?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["conversation_member_role"]
          status?: Database["public"]["Enums"]["conversation_member_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_preferences: {
        Row: {
          archived_at: string | null
          cleared_before: string | null
          conversation_id: string
          created_at: string
          favorited_at: string | null
          muted_until: string | null
          notifications_enabled: boolean
          profile_id: string
          read_receipts_enabled: boolean
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          cleared_before?: string | null
          conversation_id: string
          created_at?: string
          favorited_at?: string | null
          muted_until?: string | null
          notifications_enabled?: boolean
          profile_id: string
          read_receipts_enabled?: boolean
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          cleared_before?: string | null
          conversation_id?: string
          created_at?: string
          favorited_at?: string | null
          muted_until?: string | null
          notifications_enabled?: boolean
          profile_id?: string
          read_receipts_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_preferences_conversation_id_profile_id_fkey"
            columns: ["conversation_id", "profile_id"]
            isOneToOne: true
            referencedRelation: "conversation_members"
            referencedColumns: ["conversation_id", "profile_id"]
          },
        ]
      }
      conversation_requests: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          opening_message: string | null
          recipient_id: string
          requester_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["conversation_request_status"]
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          opening_message?: string | null
          recipient_id: string
          requester_id: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["conversation_request_status"]
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          opening_message?: string | null
          recipient_id?: string
          requester_id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["conversation_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "conversation_requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_requests_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string | null
          direct_user_high: string | null
          direct_user_low: string | null
          id: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          direct_user_high?: string | null
          direct_user_low?: string | null
          id?: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          direct_user_high?: string | null
          direct_user_low?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["conversation_kind"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_direct_user_high_fkey"
            columns: ["direct_user_high"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_direct_user_low_fkey"
            columns: ["direct_user_low"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          accepted_at: string | null
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          bucket_id: string
          byte_size: number
          created_at: string
          duration_seconds: number | null
          forwarded_from_attachment_id: string | null
          height: number | null
          id: string
          message_id: string
          mime_type: string
          object_path: string
          owner_id: string
          waveform: Json | null
          width: number | null
        }
        Insert: {
          bucket_id?: string
          byte_size: number
          created_at?: string
          duration_seconds?: number | null
          forwarded_from_attachment_id?: string | null
          height?: number | null
          id?: string
          message_id: string
          mime_type: string
          object_path: string
          owner_id: string
          waveform?: Json | null
          width?: number | null
        }
        Update: {
          bucket_id?: string
          byte_size?: number
          created_at?: string
          duration_seconds?: number | null
          forwarded_from_attachment_id?: string | null
          height?: number | null
          id?: string
          message_id?: string
          mime_type?: string
          object_path?: string
          owner_id?: string
          waveform?: Json | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_forwarded_from_attachment_id_fkey"
            columns: ["forwarded_from_attachment_id"]
            isOneToOne: false
            referencedRelation: "message_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          kind: Database["public"]["Enums"]["reaction_kind"]
          message_id: string
          reactor_id: string
        }
        Insert: {
          created_at?: string
          kind: Database["public"]["Enums"]["reaction_kind"]
          message_id: string
          reactor_id: string
        }
        Update: {
          created_at?: string
          kind?: Database["public"]["Enums"]["reaction_kind"]
          message_id?: string
          reactor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_reactor_id_fkey"
            columns: ["reactor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_receipts: {
        Row: {
          delivered_at: string | null
          message_id: string
          profile_id: string
          read_at: string | null
        }
        Insert: {
          delivered_at?: string | null
          message_id: string
          profile_id: string
          read_at?: string | null
        }
        Update: {
          delivered_at?: string | null
          message_id?: string
          profile_id?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_receipts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          client_message_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          forwarded_from_message_id: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          reply_to_message_id: string | null
          sender_id: string | null
        }
        Insert: {
          body?: string | null
          client_message_id?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          forwarded_from_message_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          reply_to_message_id?: string | null
          sender_id?: string | null
        }
        Update: {
          body?: string | null
          client_message_id?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          forwarded_from_message_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          reply_to_message_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_forwarded_from_message_id_fkey"
            columns: ["forwarded_from_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_cases: {
        Row: {
          assigned_to: string | null
          id: string
          opened_at: string
          priority: number
          report_id: string
          resolution: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          id?: string
          opened_at?: string
          priority?: number
          report_id: string
          resolution?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          id?: string
          opened_at?: string
          priority?: number
          report_id?: string
          resolution?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_cases_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_cases_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          community_enabled: boolean
          created_at: string
          email_enabled: boolean
          messages_enabled: boolean
          profile_id: string
          push_enabled: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          social_enabled: boolean
          system_enabled: boolean
          updated_at: string
        }
        Insert: {
          community_enabled?: boolean
          created_at?: string
          email_enabled?: boolean
          messages_enabled?: boolean
          profile_id: string
          push_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          social_enabled?: boolean
          system_enabled?: boolean
          updated_at?: string
        }
        Update: {
          community_enabled?: boolean
          created_at?: string
          email_enabled?: boolean
          messages_enabled?: boolean
          profile_id?: string
          push_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          social_enabled?: boolean
          system_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          payload: Json
          read_at: string | null
          recipient_id: string
          type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_id: string
          type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          parent_comment_id: string | null
          post_id: string
          status: Database["public"]["Enums"]["content_status"]
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          post_id: string
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          post_id?: string
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_media: {
        Row: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number | null
          id: string
          mime_type: string
          object_path: string
          owner_id: string
          post_id: string
          sort_order: number
          width: number | null
        }
        Insert: {
          bucket_id?: string
          byte_size: number
          created_at?: string
          height?: number | null
          id?: string
          mime_type: string
          object_path: string
          owner_id: string
          post_id: string
          sort_order?: number
          width?: number | null
        }
        Update: {
          bucket_id?: string
          byte_size?: number
          created_at?: string
          height?: number | null
          id?: string
          mime_type?: string
          object_path?: string
          owner_id?: string
          post_id?: string
          sort_order?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_media_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["reaction_kind"]
          post_id: string | null
          reactor_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["reaction_kind"]
          post_id?: string | null
          reactor_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["reaction_kind"]
          post_id?: string | null
          reactor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_reactor_id_fkey"
            columns: ["reactor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_details: {
        Row: {
          created_at: string
          desired_places: string[]
          favorite_artists: Json
          favorite_books: Json
          favorite_games: Json
          favorite_movies: Json
          favorite_season: string | null
          favorite_series: Json
          favorite_songs: Json
          hobbies: string[]
          interests: string[]
          personality: string[]
          profile_id: string
          social_energy: string | null
          updated_at: string
          visited_places: string[]
          weekend_preferences: string[]
        }
        Insert: {
          created_at?: string
          desired_places?: string[]
          favorite_artists?: Json
          favorite_books?: Json
          favorite_games?: Json
          favorite_movies?: Json
          favorite_season?: string | null
          favorite_series?: Json
          favorite_songs?: Json
          hobbies?: string[]
          interests?: string[]
          personality?: string[]
          profile_id: string
          social_energy?: string | null
          updated_at?: string
          visited_places?: string[]
          weekend_preferences?: string[]
        }
        Update: {
          created_at?: string
          desired_places?: string[]
          favorite_artists?: Json
          favorite_books?: Json
          favorite_games?: Json
          favorite_movies?: Json
          favorite_season?: string | null
          favorite_series?: Json
          favorite_songs?: Json
          hobbies?: string[]
          interests?: string[]
          personality?: string[]
          profile_id?: string
          social_energy?: string | null
          updated_at?: string
          visited_places?: string[]
          weekend_preferences?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "profile_details_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_media: {
        Row: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number
          id: string
          mime_type: string
          object_path: string
          profile_id: string
          purpose: Database["public"]["Enums"]["profile_media_purpose"]
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number
        }
        Insert: {
          bucket_id?: string
          byte_size: number
          created_at?: string
          height: number
          id?: string
          mime_type: string
          object_path: string
          profile_id: string
          purpose: Database["public"]["Enums"]["profile_media_purpose"]
          sort_order?: number
          status?: Database["public"]["Enums"]["media_processing_status"]
          updated_at?: string
          width: number
        }
        Update: {
          bucket_id?: string
          byte_size?: number
          created_at?: string
          height?: number
          id?: string
          mime_type?: string
          object_path?: string
          profile_id?: string
          purpose?: Database["public"]["Enums"]["profile_media_purpose"]
          sort_order?: number
          status?: Database["public"]["Enums"]["media_processing_status"]
          updated_at?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "profile_media_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_moderation_state: {
        Row: {
          created_at: string
          profile_id: string
          public_reason: string | null
          restricted_until: string | null
          status: Database["public"]["Enums"]["profile_account_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          public_reason?: string | null
          restricted_until?: string | null
          status?: Database["public"]["Enums"]["profile_account_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          public_reason?: string | null
          restricted_until?: string | null
          status?: Database["public"]["Enums"]["profile_account_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_moderation_state_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_privacy: {
        Row: {
          age_visibility: Database["public"]["Enums"]["profile_visibility"]
          created_at: string
          dating_enabled: boolean
          favorites_visibility: Database["public"]["Enums"]["profile_visibility"]
          gallery_visibility: Database["public"]["Enums"]["profile_visibility"]
          location_visibility: Database["public"]["Enums"]["profile_visibility"]
          profile_id: string
          profile_visibility: Database["public"]["Enums"]["profile_visibility"]
          updated_at: string
        }
        Insert: {
          age_visibility?: Database["public"]["Enums"]["profile_visibility"]
          created_at?: string
          dating_enabled?: boolean
          favorites_visibility?: Database["public"]["Enums"]["profile_visibility"]
          gallery_visibility?: Database["public"]["Enums"]["profile_visibility"]
          location_visibility?: Database["public"]["Enums"]["profile_visibility"]
          profile_id: string
          profile_visibility?: Database["public"]["Enums"]["profile_visibility"]
          updated_at?: string
        }
        Update: {
          age_visibility?: Database["public"]["Enums"]["profile_visibility"]
          created_at?: string
          dating_enabled?: boolean
          favorites_visibility?: Database["public"]["Enums"]["profile_visibility"]
          gallery_visibility?: Database["public"]["Enums"]["profile_visibility"]
          location_visibility?: Database["public"]["Enums"]["profile_visibility"]
          profile_id?: string
          profile_visibility?: Database["public"]["Enums"]["profile_visibility"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_privacy_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          bio: string | null
          birth_date: string | null
          church: string | null
          city: string | null
          created_at: string
          full_name: string | null
          id: string
          onboarding_completed_at: string | null
          onboarding_step: number
          state_code: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_path?: string | null
          bio?: string | null
          birth_date?: string | null
          church?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          onboarding_completed_at?: string | null
          onboarding_step?: number
          state_code?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_path?: string | null
          bio?: string | null
          birth_date?: string | null
          church?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          onboarding_completed_at?: string | null
          onboarding_step?: number
          state_code?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      report_evidence: {
        Row: {
          bucket_id: string
          byte_size: number
          created_at: string
          id: string
          mime_type: string
          object_path: string
          report_id: string
          uploader_id: string
        }
        Insert: {
          bucket_id?: string
          byte_size: number
          created_at?: string
          id?: string
          mime_type: string
          object_path: string
          report_id: string
          uploader_id: string
        }
        Update: {
          bucket_id?: string
          byte_size?: number
          created_at?: string
          id?: string
          mime_type?: string
          object_path?: string
          report_id?: string
          uploader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_evidence_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_evidence_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          details: string | null
          id: string
          reporter_id: string
          resolution: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category: string
          created_at?: string
          details?: string | null
          id?: string
          reporter_id: string
          resolution?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          details?: string | null
          id?: string
          reporter_id?: string
          resolution?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_type?: Database["public"]["Enums"]["report_target_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sanctions: {
        Row: {
          action_type: Database["public"]["Enums"]["moderation_action_type"]
          case_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          imposed_by: string | null
          metadata: Json
          reason: string
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          starts_at: string
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
        }
        Insert: {
          action_type: Database["public"]["Enums"]["moderation_action_type"]
          case_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          imposed_by?: string | null
          metadata?: Json
          reason: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          starts_at?: string
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
        }
        Update: {
          action_type?: Database["public"]["Enums"]["moderation_action_type"]
          case_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          imposed_by?: string | null
          metadata?: Json
          reason?: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          starts_at?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["report_target_type"]
        }
        Relationships: [
          {
            foreignKeyName: "sanctions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sanctions_imposed_by_fkey"
            columns: ["imposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sanctions_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          high_contrast: boolean
          locale: string
          profile_id: string
          reduced_motion: boolean
          timezone_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          high_contrast?: boolean
          locale?: string
          profile_id: string
          reduced_motion?: boolean
          timezone_name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          high_contrast?: boolean
          locale?: string
          profile_id?: string
          reduced_motion?: boolean
          timezone_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_moderation_action: {
        Args: {
          p_action_type: Database["public"]["Enums"]["moderation_action_type"]
          p_expires_at?: string
          p_reason: string
          p_report_id: string
        }
        Returns: {
          action_type: Database["public"]["Enums"]["moderation_action_type"]
          case_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          imposed_by: string | null
          metadata: Json
          reason: string
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          starts_at: string
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
        }
        SetofOptions: {
          from: "*"
          to: "sanctions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_own_onboarding: {
        Args: Record<PropertyKey, never>
        Returns: {
          avatar_path: string | null
          bio: string | null
          birth_date: string | null
          church: string | null
          city: string | null
          created_at: string
          full_name: string | null
          id: string
          onboarding_completed_at: string | null
          onboarding_step: number
          state_code: string | null
          updated_at: string
          username: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      block_profile: {
        Args: { p_reason?: string; p_target_profile_id: string }
        Returns: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
          reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "blocks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      clear_conversation_for_me: {
        Args: { p_conversation_id: string }
        Returns: {
          archived_at: string | null
          cleared_before: string | null
          conversation_id: string
          created_at: string
          favorited_at: string | null
          muted_until: string | null
          notifications_enabled: boolean
          profile_id: string
          read_receipts_enabled: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_account_lifecycle: {
        Args: { p_request_id: string }
        Returns: {
          cancelled_at: string | null
          completed_at: string | null
          execute_after: string
          id: string
          kind: Database["public"]["Enums"]["account_lifecycle_kind"]
          requested_at: string
          status: Database["public"]["Enums"]["account_lifecycle_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "account_lifecycle_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_moderation_case: {
        Args: { p_case_id: string }
        Returns: {
          assigned_to: string | null
          id: string
          opened_at: string
          priority: number
          report_id: string
          resolution: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "moderation_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_profile_media_cleanup: {
        Args: { p_media_id: string }
        Returns: undefined
      }
      create_community: {
        Args: {
          p_description?: string
          p_name: string
          p_slug: string
          p_visibility?: Database["public"]["Enums"]["community_visibility"]
        }
        Returns: {
          archived_at: string | null
          avatar_path: string | null
          cover_path: string | null
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string | null
          slug: string
          updated_at: string
          visibility: Database["public"]["Enums"]["community_visibility"]
        }
        SetofOptions: {
          from: "*"
          to: "communities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_group_conversation: {
        Args: { p_member_ids: string[]; p_title: string }
        Returns: {
          created_at: string
          created_by: string | null
          direct_user_high: string | null
          direct_user_low: string | null
          id: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_report: {
        Args: {
          p_category: string
          p_details?: string
          p_target_id: string
          p_target_type: Database["public"]["Enums"]["report_target_type"]
        }
        Returns: {
          assigned_to: string | null
          category: string
          created_at: string
          details: string | null
          id: string
          reporter_id: string
          resolution: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_message: {
        Args: { p_message_id: string }
        Returns: {
          body: string | null
          client_message_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          forwarded_from_message_id: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          reply_to_message_id: string | null
          sender_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      edit_message: {
        Args: { p_body: string; p_message_id: string }
        Returns: {
          body: string | null
          client_message_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          forwarded_from_message_id: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          reply_to_message_id: string | null
          sender_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      favorite_payload_is_valid: {
        Args: {
          candidate: Json
          maximum_bytes: number
          maximum_item_bytes: number
          maximum_items: number
        }
        Returns: boolean
      }
      finalize_profile_media: {
        Args: { p_media_id: string }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number
          id: string
          mime_type: string
          object_path: string
          profile_id: string
          purpose: Database["public"]["Enums"]["profile_media_purpose"]
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number
        }
        SetofOptions: {
          from: "*"
          to: "profile_media"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      forward_message: {
        Args: {
          p_client_message_id?: string
          p_source_message_id: string
          p_target_conversation_id: string
        }
        Returns: {
          body: string | null
          client_message_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          forwarded_from_message_id: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          reply_to_message_id: string | null
          sender_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_visible_profile_age: {
        Args: { p_profile_id: string }
        Returns: {
          age_years: number | null
          can_view_age: boolean
          profile_id: string
        }[]
      }
      get_visible_profiles: {
        Args: {
          page_offset?: number
          page_size?: number
          target_profile_id?: string
        }
        Returns: {
          avatar_path: string
          bio: string
          can_view_favorites: boolean
          can_view_gallery: boolean
          can_view_location: boolean
          church: string
          city: string
          desired_places: string[]
          favorite_artists: Json
          favorite_books: Json
          favorite_games: Json
          favorite_movies: Json
          favorite_season: string
          favorite_series: Json
          favorite_songs: Json
          full_name: string
          hobbies: string[]
          interests: string[]
          is_friend: boolean
          personality: string[]
          profile_id: string
          social_energy: string
          state_code: string
          username: string
          visited_places: string[]
          weekend_preferences: string[]
        }[]
      }
      invite_group_members: {
        Args: { p_conversation_id: string; p_member_ids: string[] }
        Returns: {
          conversation_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["conversation_member_role"]
          status: Database["public"]["Enums"]["conversation_member_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "conversation_members"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      join_community: {
        Args: { p_community_id: string }
        Returns: {
          community_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["community_role"]
          status: Database["public"]["Enums"]["community_membership_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "community_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      leave_community: {
        Args: { p_community_id: string }
        Returns: {
          community_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["community_role"]
          status: Database["public"]["Enums"]["community_membership_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "community_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      list_profile_media_cleanup: {
        Args: { p_limit?: number }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number
          id: string
          mime_type: string
          object_path: string
          profile_id: string
          purpose: Database["public"]["Enums"]["profile_media_purpose"]
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number
        }[]
        SetofOptions: {
          from: "*"
          to: "profile_media"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      mark_message_delivered: {
        Args: { p_message_id: string }
        Returns: {
          delivered_at: string | null
          message_id: string
          profile_id: string
          read_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "message_receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_message_read: {
        Args: { p_message_id: string }
        Returns: {
          delivered_at: string | null
          message_id: string
          profile_id: string
          read_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "message_receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_notifications_read: {
        Args: { p_notification_ids?: string[] }
        Returns: number
      }
      remove_friendship: { Args: { friendship_id: string }; Returns: undefined }
      remove_group_member: {
        Args: { p_conversation_id: string; p_profile_id: string }
        Returns: {
          conversation_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["conversation_member_role"]
          status: Database["public"]["Enums"]["conversation_member_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_profile_media: {
        Args: { p_media_id: string }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number
          id: string
          mime_type: string
          object_path: string
          profile_id: string
          purpose: Database["public"]["Enums"]["profile_media_purpose"]
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number
        }
        SetofOptions: {
          from: "*"
          to: "profile_media"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reorder_profile_gallery: {
        Args: { p_media_ids: string[] }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number
          id: string
          mime_type: string
          object_path: string
          profile_id: string
          purpose: Database["public"]["Enums"]["profile_media_purpose"]
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number
        }[]
        SetofOptions: {
          from: "*"
          to: "profile_media"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      request_account_lifecycle: {
        Args: {
          p_confirmation?: string
          p_kind: Database["public"]["Enums"]["account_lifecycle_kind"]
        }
        Returns: {
          cancelled_at: string | null
          completed_at: string | null
          execute_after: string
          id: string
          kind: Database["public"]["Enums"]["account_lifecycle_kind"]
          requested_at: string
          status: Database["public"]["Enums"]["account_lifecycle_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "account_lifecycle_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_conversation: {
        Args: { p_opening_message?: string; p_target_profile_id: string }
        Returns: {
          conversation_id: string | null
          created_at: string
          id: string
          opening_message: string | null
          recipient_id: string
          requester_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["conversation_request_status"]
        }
        SetofOptions: {
          from: "*"
          to: "conversation_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_friendship: {
        Args: { target_user_id: string }
        Returns: {
          accepted_at: string | null
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "friendships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_profile_media: {
        Args: {
          p_byte_size: number
          p_height: number
          p_mime_type: string
          p_purpose: Database["public"]["Enums"]["profile_media_purpose"]
          p_width: number
        }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number
          id: string
          mime_type: string
          object_path: string
          profile_id: string
          purpose: Database["public"]["Enums"]["profile_media_purpose"]
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number
        }
        SetofOptions: {
          from: "*"
          to: "profile_media"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_community_membership: {
        Args: {
          p_accept: boolean
          p_community_id: string
          p_profile_id: string
        }
        Returns: {
          community_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["community_role"]
          status: Database["public"]["Enums"]["community_membership_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "community_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_conversation_request: {
        Args: { p_accept: boolean; p_request_id: string }
        Returns: {
          conversation_id: string | null
          created_at: string
          id: string
          opening_message: string | null
          recipient_id: string
          requester_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["conversation_request_status"]
        }
        SetofOptions: {
          from: "*"
          to: "conversation_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_friendship: {
        Args: { accept_request: boolean; friendship_id: string }
        Returns: {
          accepted_at: string | null
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "friendships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_group_invitation: {
        Args: { p_accept: boolean; p_conversation_id: string }
        Returns: {
          conversation_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["conversation_member_role"]
          status: Database["public"]["Enums"]["conversation_member_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_visible_profiles: {
        Args: { page_offset?: number; page_size?: number; search_term?: string }
        Returns: {
          avatar_path: string
          bio: string
          can_view_favorites: boolean
          can_view_gallery: boolean
          can_view_location: boolean
          church: string
          city: string
          desired_places: string[]
          favorite_artists: Json
          favorite_books: Json
          favorite_games: Json
          favorite_movies: Json
          favorite_season: string
          favorite_series: Json
          favorite_songs: Json
          full_name: string
          hobbies: string[]
          interests: string[]
          is_friend: boolean
          personality: string[]
          profile_id: string
          social_energy: string
          state_code: string
          username: string
          visited_places: string[]
          weekend_preferences: string[]
        }[]
      }
      search_discoverable_interests: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          interest: string
          profile_count: number
        }[]
      }
      search_discoverable_posts: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          author_avatar_path: string | null
          author_id: string
          author_name: string
          author_username: string
          body: string
          comment_count: number
          community_id: string | null
          community_name: string | null
          community_slug: string | null
          created_at: string
          media_count: number
          post_id: string
          reaction_count: number
          viewer_reaction: Database["public"]["Enums"]["reaction_kind"] | null
        }[]
      }
      send_message: {
        Args: {
          p_body?: string
          p_client_message_id?: string
          p_conversation_id: string
          p_kind: Database["public"]["Enums"]["message_kind"]
          p_reply_to_message_id?: string
        }
        Returns: {
          body: string | null
          client_message_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          forwarded_from_message_id: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          reply_to_message_id: string | null
          sender_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_group_member_role: {
        Args: {
          p_conversation_id: string
          p_profile_id: string
          p_role: Database["public"]["Enums"]["conversation_member_role"]
        }
        Returns: {
          conversation_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["conversation_member_role"]
          status: Database["public"]["Enums"]["conversation_member_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_conversation_favorite: {
        Args: { p_conversation_id: string; p_favorited: boolean }
        Returns: {
          archived_at: string | null
          cleared_before: string | null
          conversation_id: string
          created_at: string
          favorited_at: string | null
          muted_until: string | null
          notifications_enabled: boolean
          profile_id: string
          read_receipts_enabled: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      text_array_payload_is_valid: {
        Args: {
          candidate_values: string[]
          maximum_bytes: number
          maximum_item_characters: number
          maximum_items: number
        }
        Returns: boolean
      }
      update_own_profile_details: {
        Args: { p_patch: Json }
        Returns: {
          created_at: string
          desired_places: string[]
          favorite_artists: Json
          favorite_books: Json
          favorite_games: Json
          favorite_movies: Json
          favorite_season: string | null
          favorite_series: Json
          favorite_songs: Json
          hobbies: string[]
          interests: string[]
          personality: string[]
          profile_id: string
          social_energy: string | null
          updated_at: string
          visited_places: string[]
          weekend_preferences: string[]
        }
        SetofOptions: {
          from: "*"
          to: "profile_details"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unblock_profile: {
        Args: { p_target_profile_id: string }
        Returns: undefined
      }
      username_is_available: { Args: { candidate: string }; Returns: boolean }
    }
    Enums: {
      account_lifecycle_kind: "data_export" | "deactivate" | "delete"
      account_lifecycle_status:
        | "pending"
        | "processing"
        | "completed"
        | "cancelled"
        | "failed"
      app_role: "super_admin" | "admin" | "moderator" | "support" | "user"
      community_membership_status: "pending" | "active" | "banned" | "left"
      community_role: "owner" | "moderator" | "member"
      community_visibility: "public" | "private"
      content_status: "active" | "hidden" | "removed"
      content_visibility: "public" | "friends" | "community" | "private"
      conversation_kind: "direct" | "group"
      conversation_member_role: "owner" | "admin" | "member"
      conversation_member_status: "invited" | "active" | "left" | "removed"
      conversation_request_status:
        | "pending"
        | "accepted"
        | "declined"
        | "cancelled"
      friendship_status: "pending" | "accepted" | "declined"
      media_processing_status: "pending" | "ready" | "deleting" | "failed"
      message_kind: "text" | "audio" | "image" | "file" | "system"
      moderation_action_type:
        | "warn"
        | "hide_content"
        | "remove_content"
        | "restrict"
        | "suspend"
        | "ban"
        | "dismiss"
      profile_account_status: "active" | "restricted" | "suspended" | "banned"
      profile_media_purpose: "avatar" | "cover" | "gallery"
      profile_visibility: "public" | "friends" | "private"
      reaction_kind: "like" | "love" | "amen" | "pray" | "support"
      report_status: "open" | "in_review" | "resolved" | "dismissed"
      report_target_type:
        | "profile"
        | "community"
        | "community_post"
        | "post_comment"
        | "message"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_lifecycle_kind: ["data_export", "deactivate", "delete"],
      account_lifecycle_status: [
        "pending",
        "processing",
        "completed",
        "cancelled",
        "failed",
      ],
      app_role: ["super_admin", "admin", "moderator", "support", "user"],
      community_membership_status: ["pending", "active", "banned", "left"],
      community_role: ["owner", "moderator", "member"],
      community_visibility: ["public", "private"],
      content_status: ["active", "hidden", "removed"],
      content_visibility: ["public", "friends", "community", "private"],
      conversation_kind: ["direct", "group"],
      conversation_member_role: ["owner", "admin", "member"],
      conversation_member_status: ["invited", "active", "left", "removed"],
      conversation_request_status: [
        "pending",
        "accepted",
        "declined",
        "cancelled",
      ],
      friendship_status: ["pending", "accepted", "declined"],
      media_processing_status: ["pending", "ready", "deleting", "failed"],
      message_kind: ["text", "audio", "image", "file", "system"],
      moderation_action_type: [
        "warn",
        "hide_content",
        "remove_content",
        "restrict",
        "suspend",
        "ban",
        "dismiss",
      ],
      profile_account_status: ["active", "restricted", "suspended", "banned"],
      profile_media_purpose: ["avatar", "cover", "gallery"],
      profile_visibility: ["public", "friends", "private"],
      reaction_kind: ["like", "love", "amen", "pray", "support"],
      report_status: ["open", "in_review", "resolved", "dismissed"],
      report_target_type: [
        "profile",
        "community",
        "community_post",
        "post_comment",
        "message",
      ],
    },
  },
} as const
