export async function up(knex) {
  await knex.schema.createTable('events', table => {
    table.string('id').primary();
    table.string('shop').notNullable();
    table.string('name').notNullable();
    table.text('payload_json').nullable();
    table.bigInteger('created_at').notNullable();
    table.index(['shop', 'name', 'created_at'], 'idx_events_shop_name_created');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('events');
}
