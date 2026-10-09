-- audit-seed.sql ile eklenen geçici verinin silinmesi.
DELETE FROM whatsapp_bulk_sends WHERE employee_name LIKE 'E2E Seed %';
DELETE FROM listings WHERE listing_number LIKE 'E2E-%';
DELETE FROM tasks WHERE title LIKE 'E2E Görev%';
DELETE FROM uk_program_enrollments WHERE employee_id IN (SELECT e.id FROM employees e JOIN candidates c ON c.id = e.candidate_id WHERE c.name LIKE 'E2E Seed %');
DELETE FROM employees WHERE candidate_id IN (SELECT id FROM candidates WHERE name LIKE 'E2E Seed %');
DELETE FROM candidates WHERE name LIKE 'E2E Seed %';
