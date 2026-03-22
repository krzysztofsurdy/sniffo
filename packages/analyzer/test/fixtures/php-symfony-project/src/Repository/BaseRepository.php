<?php
namespace App\Repository;
abstract class BaseRepository {
    abstract public function findAll(): array;
    public function count(): int { return 0; }
}
