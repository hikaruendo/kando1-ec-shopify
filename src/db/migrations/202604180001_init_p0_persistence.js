export async function up(knex) {
  await knex.schema.createTable('jobs', table => {
    table.string('id').primary();
    table.string('shop').notNullable();
    table.string('product_id').notNullable();
    table.string('status').notNullable();
    table.integer('changed_count').notNullable().defaultTo(0);
    table.integer('error_count').notNullable().defaultTo(0);
    table.integer('affected_variants').notNullable().defaultTo(0);
    table.bigInteger('created_at').notNullable();
    table.bigInteger('completed_at').nullable();
    table.text('errors_json').nullable();
    table.index(['shop', 'created_at'], 'idx_jobs_shop_created');
  });

  await knex.schema.createTable('job_snapshots', table => {
    table.string('job_id').notNullable();
    table.string('variant_id').notNullable();
    table.string('before_price').notNullable();
    table.string('after_price').notNullable();
    table.integer('position').notNullable().defaultTo(0);
    table.primary(['job_id', 'variant_id']);
    table.foreign('job_id').references('jobs.id').onDelete('CASCADE');
  });

  await knex.schema.createTable('shop_sessions', table => {
    table.string('shop').primary();
    table.text('access_token').notNullable();
    table.string('scope').nullable();
    table.string('source').nullable();
    table.bigInteger('updated_at').notNullable();
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('shop_sessions');
  await knex.schema.dropTableIfExists('job_snapshots');
  await knex.schema.dropTableIfExists('jobs');
}
