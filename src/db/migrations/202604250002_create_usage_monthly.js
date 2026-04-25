export async function up(knex) {
  await knex.schema.createTable('usage_monthly', table => {
    table.string('shop').notNullable();
    table.string('year_month').notNullable();
    table.integer('completed_tasks').notNullable().defaultTo(0);
    table.integer('affected_variants_total').notNullable().defaultTo(0);
    table.primary(['shop', 'year_month']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('usage_monthly');
}
