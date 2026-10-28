/**
 * Creates an in-memory mock of the Supabase client query builder
 * specifically for isolated unit/integration tests of the API layer.
 *
 * Clearly labeled: [MOCK TEST HARNESS]
 * This mock ensures tests execute fast, offline, and never touch production databases.
 */
export function createMockSupabaseClient(initialRows = [], mockOptions = {}) {
  const store = [...initialRows]

  return {
    _store: store,
    from(tableName) {
      if (tableName !== 'registrations') {
        throw new Error(`Unexpected table: ${tableName}`)
      }

      return {
        // Mock INSERT
        insert(rows) {
          const rowToInsert = rows[0]
          return {
            select(fields) {
              return {
                async single() {
                  // Check duplicate email constraint
                  const duplicate = store.find(
                    (r) => r.email.toLowerCase() === rowToInsert.email.toLowerCase()
                  )
                  if (duplicate) {
                    return {
                      data: null,
                      error: {
                        code: '23505',
                        message: 'duplicate key value violates unique constraint "uq_registrations_email"'
                      }
                    }
                  }

                  const newRecord = {
                    id: 'mock-uuid-' + (store.length + 1),
                    ...rowToInsert,
                    created_at: new Date().toISOString()
                  }
                  store.push(newRecord)
                  return { data: newRecord, error: null }
                }
              }
            }
          }
        },

        // Mock SELECT (paginated or count)
        select(fields, options = {}) {
          let rows = [...store]
          let isHeadCount = options.head === true

          const queryBuilder = {
            eq(column, value) {
              rows = rows.filter((r) => r[column] === value)
              return queryBuilder
            },

            order(column, { ascending = false } = {}) {
              rows.sort((a, b) => {
                const dateA = new Date(a[column]).getTime()
                const dateB = new Date(b[column]).getTime()
                return ascending ? dateA - dateB : dateB - dateA
              })
              return queryBuilder
            },

            range(from, to) {
              const totalCount = rows.length
              const pagedRows = rows.slice(from, to + 1)
              return Promise.resolve({
                data: pagedRows,
                error: null,
                count: totalCount
              })
            },

            then(resolve, reject) {
              if (mockOptions.queryError) {
                resolve({ count: null, data: null, error: mockOptions.queryError })
                return
              }
              if (isHeadCount) {
                resolve({ count: rows.length, error: null })
              } else {
                resolve({ data: rows, error: null, count: rows.length })
              }
            }
          }

          return queryBuilder
        }
      }
    }
  }
}
