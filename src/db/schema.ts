import { pgSchema, text, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const concursosCge = pgSchema('concursos_cge')

export const config = concursosCge.table('config', {
  id: integer('id').primaryKey().default(1),
  // category IDs: departments (e.g. 45=Paraná) AND levels (e.g. 151=Secundario)
  categoryDepts: jsonb('category_depts').$type<number[]>().notNull().default([45]),
  categoryLevels: jsonb('category_levels').$type<number[]>().notNull().default([151]),
  searchString: text('search_string').notNull().default(''),
  emailTo: text('email_to').notNull().default(''),
  // cron expression in UTC (e.g. "0 10 * * *" = 07:00 ART)
  scheduleCron: text('schedule_cron').notNull().default('0 10 * * *'),
  isActive: boolean('is_active').notNull().default(true),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const state = concursosCge.table('state', {
  id: integer('id').primaryKey().default(1),
  lastRunAt: timestamp('last_run_at'),
  // ISO date string of the most recent post seen — used as `after` param in next run
  lastPostDate: text('last_post_date'),
  lastPostId: integer('last_post_id'),
  lastFoundCount: integer('last_found_count').notNull().default(0),
})

export const allowedEmails = concursosCge.table('allowed_emails', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  email: text('email').notNull().unique(),
  label: text('label'),       // nombre del invitado (opcional)
  invitedBy: text('invited_by').notNull(),
  invitedAt: timestamp('invited_at').defaultNow(),
})

export const runHistory = concursosCge.table('run_history', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  ranAt: timestamp('ran_at').defaultNow(),
  postsFound: integer('posts_found').notNull().default(0),
  emailSent: boolean('email_sent').notNull().default(false),
  emailTo: text('email_to'),
  postsData: jsonb('posts_data').$type<{ id: number; title: string; link: string; date: string }[]>(),
})
