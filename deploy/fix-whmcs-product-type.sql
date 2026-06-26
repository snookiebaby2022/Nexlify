-- License products must be type "other", not "server" (hides Configure Server form at checkout)
UPDATE tblproducts SET type = 'other', showdomainoptions = 0 WHERE id BETWEEN 1 AND 13;
